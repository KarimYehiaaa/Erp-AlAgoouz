import { describe, expect, it } from 'vitest';
import { evaluateAuditReport, parseAuditReport } from '../../scripts/security/security-audit.ts';

const reportFor = (vulnerabilities: Record<string, unknown>, total: number) => ({
  auditReportVersion: 2,
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: total, critical: 0, total },
    dependencies: { total: 10 },
  },
  vulnerabilities,
});

describe('npm runtime security audit gate', () => {
  it('accepts a complete clean report', () => {
    expect(parseAuditReport(JSON.stringify(reportFor({}, 0))).metadata.vulnerabilities.total).toBe(
      0,
    );
  });

  it('blocks registry errors and incomplete JSON instead of interpreting them as zero findings', () => {
    expect(() => parseAuditReport(JSON.stringify({ error: { code: 'ECONNRESET' } }))).toThrow(
      /successful report/,
    );
    expect(() =>
      parseAuditReport(JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} })),
    ).toThrow(/incomplete/);
    expect(() => parseAuditReport('')).toThrow(/empty/);
  });

  it('blocks contradictory reports that claim zero findings while listing a vulnerable package', () => {
    expect(() =>
      parseAuditReport(
        JSON.stringify(
          reportFor(
            { vulnerable: { severity: 'high', isDirect: true, via: [{ title: 'RCE' }] } },
            0,
          ),
        ),
      ),
    ).toThrow(/inconsistent/);
  });

  it('fails the release gate for unapproved high and critical findings', () => {
    const report = parseAuditReport(
      JSON.stringify(
        reportFor(
          {
            vulnerable: {
              severity: 'high',
              isDirect: false,
              via: [
                {
                  severity: 'critical',
                  title: 'Remote code execution',
                  url: 'https://registry.example/advisory',
                },
              ],
            },
          },
          1,
        ),
      ),
    );
    expect(evaluateAuditReport(report).unapproved).toEqual([
      {
        pkg: 'vulnerable',
        severity: 'critical',
        title: 'Remote code execution',
        url: 'https://registry.example/advisory',
      },
    ]);
  });

  it('accepts only the documented xlsx advisories as mitigated exceptions', () => {
    const report = parseAuditReport(
      JSON.stringify(
        reportFor(
          {
            xlsx: {
              severity: 'high',
              isDirect: true,
              via: [
                {
                  severity: 'high',
                  title: 'GHSA-4r6h-8v6p-xvw6',
                  url: 'https://github.com/advisories/GHSA-4r6h-8v6p-xvw6',
                },
              ],
            },
          },
          1,
        ),
      ),
    );
    expect(evaluateAuditReport(report)).toEqual({
      approved: [
        {
          pkg: 'xlsx',
          severity: 'high',
          title: 'GHSA-4r6h-8v6p-xvw6',
          mitigation:
            'backend/src/services/excelSecurity.ts (MAX_EXCEL_BYTES, sheetRows=5000, cellFormula=false, cellHTML=false, cellStyles=false)',
        },
      ],
      unapproved: [],
    });
  });
});
