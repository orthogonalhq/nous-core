/**
 * Witness CLI commands.
 */
import type { VerificationReportId } from '@nous/shared';
import type { CliTrpcClient } from '../trpc-client.js';

export interface WitnessVerifyOptions {
  fromSequence?: number;
  toSequence?: number;
  json?: boolean;
}

export interface WitnessListOptions {
  limit?: number;
  json?: boolean;
}

export interface WitnessGetOptions {
  id: string;
  json?: boolean;
}

export async function runWitnessVerify(
  client: CliTrpcClient,
  options: WitnessVerifyOptions,
): Promise<number> {
  try {
    const report = await client.witness.verify.mutate({
      fromSequence: options.fromSequence,
      toSequence: options.toSequence,
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return 0;
    }

    console.log(`Verification report: ${report.id}`);
    console.log(`Status: ${report.status}`);
    console.log(
      `Findings: S0=${report.invariants.bySeverity.S0}, S1=${report.invariants.bySeverity.S1}, S2=${report.invariants.bySeverity.S2}`,
    );
    console.log(
      `Range: ${report.range.fromSequence} -> ${report.range.toSequence}`,
    );
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    return 1;
  }
}

export async function runWitnessList(
  client: CliTrpcClient,
  options: WitnessListOptions,
): Promise<number> {
  try {
    const reports = await client.witness.listReports.query({
      limit: options.limit,
    });

    if (options.json) {
      console.log(JSON.stringify(reports, null, 2));
      return 0;
    }

    if (reports.length === 0) {
      console.log('No witness verification reports found.');
      return 0;
    }

    console.log('ID                                 STATUS   GENERATED_AT');
    for (const report of reports) {
      console.log(`${report.id}  ${report.status.padEnd(7)} ${report.generatedAt}`);
    }
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    return 1;
  }
}

export async function runWitnessGet(
  client: CliTrpcClient,
  options: WitnessGetOptions,
): Promise<number> {
  try {
    const report = await client.witness.getReport.query({
      id: options.id as VerificationReportId,
    });

    if (!report) {
      console.error(`Witness report not found: ${options.id}`);
      return 1;
    }

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return 0;
    }

    console.log(`Verification report: ${report.id}`);
    console.log(`Status: ${report.status}`);
    console.log(`Generated at: ${report.generatedAt}`);
    console.log(`Receipt verified: ${report.receipt.verified ? 'yes' : 'no'}`);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    return 1;
  }
}
