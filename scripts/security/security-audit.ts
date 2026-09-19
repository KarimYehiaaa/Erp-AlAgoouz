/**
 * scripts/security-audit.ts — فاحص الأمان الصارم للاعتماديات التشغيلية (Runtime Security Audit Gate)
 * يتحقق من عدم وجود أي ثغرات High أو Critical في بيئة الإنتاج (npm audit --omit=dev).
 * يمنع تجاوز الثغرات بشكل عشوائي، ويوثق استثناء SheetJS (xlsx) غير القابل للتحديث من npm والمؤمَّن بـ excelSecurity.ts.
 */
import { execSync } from 'child_process';

interface AuditAdvisory {
  source?: number;
  name?: string;
  dependency?: string;
  title?: string;
  url?: string;
  severity?: string;
  range?: string;
}

interface VulnerabilityReport {
  name: string;
  severity: string;
  isDirect: boolean;
  via: Array<string | AuditAdvisory>;
}

// الثغرات غير القابلة للترقية من سجل npm العام (SheetJS unmaintained on npm registry beyond 0.18.5)
// والمؤمَّنة بالكامل داخل كود الباك عبر backend/src/services/excelSecurity.ts
const APPROVED_EXCEPTIONS = [
  {
    package: 'xlsx',
    advisories: ['GHSA-4r6h-8v6p-xvw6', 'GHSA-5pgg-2g8v-p4x9'],
    mitigation: 'backend/src/services/excelSecurity.ts (MAX_EXCEL_BYTES, sheetRows=5000, cellFormula=false, cellHTML=false, cellStyles=false)',
  },
];

function runSecurityAudit() {
  console.log('🔒 Running production runtime dependency security audit (npm audit --omit=dev)...');

  let output = '';
  try {
    output = execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err: any) {
    output = err.stdout?.toString() || '';
  }

  if (!output.trim()) {
    console.error('❌ Security Audit failed: empty audit output received from npm.');
    process.exit(1);
  }

  let auditData: any;
  try {
    auditData = JSON.parse(output);
  } catch (parseErr) {
    console.error('❌ Failed to parse npm audit JSON output:', parseErr);
    process.exit(1);
  }

  const vulnerabilities: Record<string, VulnerabilityReport> = auditData.vulnerabilities || {};
  const unapprovedIssues: Array<{ pkg: string; severity: string; title: string; url: string }> = [];

  for (const [pkgName, vuln] of Object.entries(vulnerabilities)) {
    const isDirectOrTransitive = vuln.severity === 'high' || vuln.severity === 'critical';

    // Inspect each finding
    for (const viaItem of vuln.via) {
      if (typeof viaItem === 'object' && viaItem !== null) {
        const severity = viaItem.severity || vuln.severity;
        const title = viaItem.title || '';
        const url = viaItem.url || '';

        // Check if matching approved exception
        const isApprovedException = APPROVED_EXCEPTIONS.some(
          (ex) =>
            ex.package === pkgName &&
            ex.advisories.some((adv) => url.includes(adv) || title.includes(adv))
        );

        if (isApprovedException) {
          console.log(
            `ℹ️  [Accepted Exception] ${pkgName} (${severity.toUpperCase()}): "${title}". Mitigation: ${APPROVED_EXCEPTIONS[0].mitigation}`
          );
        } else if (severity === 'high' || severity === 'critical') {
          unapprovedIssues.push({ pkg: pkgName, severity, title, url });
        }
      }
    }
  }

  if (unapprovedIssues.length > 0) {
    console.error(`\n🚨 CRITICAL SECURITY GATE FAILURE: ${unapprovedIssues.length} unapproved runtime vulnerabilities detected!`);
    for (const issue of unapprovedIssues) {
      console.error(`  - Package: ${issue.pkg} | Severity: ${issue.severity.toUpperCase()} | Title: ${issue.title} | Link: ${issue.url}`);
    }
    console.error('\n❌ Production release gate blocked: Fix these vulnerabilities before release.\n');
    process.exit(1);
  }

  console.log('✅ Production Runtime Security Audit Passed: 0 unapproved vulnerabilities detected.');
}

runSecurityAudit();
