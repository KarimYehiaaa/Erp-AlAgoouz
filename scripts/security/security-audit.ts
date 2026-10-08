/**
 * Runtime dependency security gate. Operational npm/registry errors must fail closed;
 * only a complete npm audit report can be used to decide whether release is safe.
 */
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

interface AuditMetadata {
  vulnerabilities: { total: number };
}

interface NpmAuditReport {
  auditReportVersion: number;
  metadata: AuditMetadata;
  vulnerabilities: Record<string, VulnerabilityReport>;
}

interface AuditIssue {
  pkg: string;
  severity: string;
  title: string;
  url: string;
}

const APPROVED_EXCEPTIONS = [
  {
    package: 'xlsx',
    advisories: ['GHSA-4r6h-8v6p-xvw6', 'GHSA-5pgg-2g8v-p4x9'],
    mitigation:
      'backend/src/services/excelSecurity.ts (MAX_EXCEL_BYTES, sheetRows=5000, cellFormula=false, cellHTML=false, cellStyles=false)',
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Parse only complete npm audit reports; valid JSON error envelopes are not clean audits. */
export function parseAuditReport(output: string): NpmAuditReport {
  if (!output.trim()) throw new Error('npm returned an empty audit response');

  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    throw new Error('npm returned malformed audit JSON');
  }

  if (!isRecord(value) || 'error' in value) {
    throw new Error('npm audit did not return a successful report');
  }
  const metadata = value.metadata;
  const vulnerabilityTotals = isRecord(metadata) ? metadata.vulnerabilities : undefined;
  const vulnerabilities = value.vulnerabilities;
  if (
    !Number.isInteger(value.auditReportVersion) ||
    !isRecord(vulnerabilityTotals) ||
    !Number.isInteger(vulnerabilityTotals.total) ||
    (vulnerabilityTotals.total as number) < 0 ||
    !isRecord(vulnerabilities)
  ) {
    throw new Error('npm audit report is incomplete');
  }

  const entries = Object.entries(vulnerabilities);
  if ((vulnerabilityTotals.total as number) === 0 && entries.length > 0) {
    throw new Error('npm audit report contains inconsistent vulnerability totals');
  }
  if ((vulnerabilityTotals.total as number) > 0 && entries.length === 0) {
    throw new Error('npm audit report omitted its vulnerability findings');
  }

  for (const [name, vulnerability] of entries) {
    if (
      !isRecord(vulnerability) ||
      typeof vulnerability.severity !== 'string' ||
      !Array.isArray(vulnerability.via)
    ) {
      throw new Error(`npm audit report contains an invalid finding for ${name}`);
    }
    for (const advisory of vulnerability.via) {
      if (typeof advisory !== 'string' && !isRecord(advisory)) {
        throw new Error(`npm audit report contains an invalid advisory for ${name}`);
      }
    }
  }

  return value as unknown as NpmAuditReport;
}

export function evaluateAuditReport(report: NpmAuditReport): {
  approved: Array<{ pkg: string; severity: string; title: string; mitigation: string }>;
  unapproved: AuditIssue[];
} {
  const approved: Array<{ pkg: string; severity: string; title: string; mitigation: string }> = [];
  const unapproved: AuditIssue[] = [];

  for (const [pkgName, vulnerability] of Object.entries(report.vulnerabilities)) {
    for (const viaItem of vulnerability.via) {
      if (typeof viaItem !== 'object' || viaItem === null) continue;
      const severity = viaItem.severity || vulnerability.severity;
      const title = viaItem.title || '';
      const url = viaItem.url || '';
      const exception = APPROVED_EXCEPTIONS.find(
        (candidate) =>
          candidate.package === pkgName &&
          candidate.advisories.some(
            (advisory) => url.includes(advisory) || title.includes(advisory),
          ),
      );

      if (exception) {
        approved.push({ pkg: pkgName, severity, title, mitigation: exception.mitigation });
      } else if (severity === 'high' || severity === 'critical') {
        unapproved.push({ pkg: pkgName, severity, title, url });
      }
    }
  }
  return { approved, unapproved };
}

function runSecurityAudit(): void {
  console.log('🔒 Running production runtime dependency security audit (npm audit --omit=dev)...');

  let output = '';
  try {
    output = execSync('npm audit --omit=dev --json', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error: unknown) {
    if (isRecord(error) && typeof error.stdout === 'string') output = error.stdout;
  }

  let report: NpmAuditReport;
  try {
    report = parseAuditReport(output);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown audit response';
    console.error(`❌ Security Audit unavailable or incomplete: ${message}. Release is blocked.`);
    process.exit(1);
  }

  const { approved, unapproved } = evaluateAuditReport(report);
  for (const exception of approved) {
    console.log(
      `ℹ️  [Accepted Exception] ${exception.pkg} (${exception.severity.toUpperCase()}): "${exception.title}". Mitigation: ${exception.mitigation}`,
    );
  }

  if (unapproved.length > 0) {
    console.error(
      `\n🚨 CRITICAL SECURITY GATE FAILURE: ${unapproved.length} unapproved runtime vulnerabilities detected!`,
    );
    for (const issue of unapproved) {
      console.error(
        `  - Package: ${issue.pkg} | Severity: ${issue.severity.toUpperCase()} | Title: ${issue.title} | Link: ${issue.url}`,
      );
    }
    console.error(
      '\n❌ Production release gate blocked: Fix these vulnerabilities before release.\n',
    );
    process.exit(1);
  }

  console.log(
    '✅ Production Runtime Security Audit Passed: 0 unapproved vulnerabilities detected.',
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSecurityAudit();
}
