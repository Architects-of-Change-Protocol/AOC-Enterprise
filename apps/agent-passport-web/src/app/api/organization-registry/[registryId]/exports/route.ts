/**
 * POST /api/organization-registry/[registryId]/exports
 *   Generate a new export artifact.
 *
 * GET /api/organization-registry/[registryId]/exports
 *   List export history (metadata only, no content_text).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateRegistryExport,
  listRegistryExports,
  isValidExportType,
} from '@/lib/registry-export-service';
import { getRegistryBillingEnforcementState, requireRegistryBillingForAction } from '@/lib/registry-billing-enforcement';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { registryId: string } },
) {
  const { registryId } = params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' } },
      { status: 400 },
    );
  }

  const { access_token, export_type } = body as Record<string, unknown>;

  if (!access_token || typeof access_token !== 'string') {
    return NextResponse.json(
      { ok: false, error: { code: 'REGISTRY_EXPORT_ACCESS_DENIED', message: 'access_token is required.' } },
      { status: 403 },
    );
  }

  if (!export_type || typeof export_type !== 'string') {
    return NextResponse.json(
      { ok: false, error: { code: 'REGISTRY_EXPORT_INVALID_TYPE', message: 'export_type is required.' } },
      { status: 400 },
    );
  }

  if (!isValidExportType(export_type)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'REGISTRY_EXPORT_INVALID_TYPE',
          message: `Invalid export_type. Valid types: registry_inventory_csv, registry_governance_json, registry_evidence_bundle_json, registry_governance_report_markdown, registry_governance_report_html`,
        },
      },
      { status: 400 },
    );
  }

  // Billing enforcement for new export generation
  const enforcementState = await getRegistryBillingEnforcementState(registryId);
  const billingCheck = requireRegistryBillingForAction({
    billingStatus: enforcementState.billingStatus,
    gracePeriodEndsAt: enforcementState.gracePeriodEndsAt,
    action: 'generate_export',
  });
  if (!billingCheck.allowed) {
    return NextResponse.json(
      { ok: false, error: { code: 'REGISTRY_BILLING_SUSPENDED', message: billingCheck.reason ?? 'Registry export generation blocked due to billing status.' } },
      { status: 403 },
    );
  }

  const result = generateRegistryExport({
    registryId,
    accessToken: access_token,
    exportType: export_type,
  });

  if (!result.ok || !result.result) {
    const code = result.errorCode ?? 'REGISTRY_EXPORT_GENERATION_FAILED';
    const status =
      code === 'REGISTRY_NOT_FOUND' ? 404 :
      code === 'REGISTRY_EXPORT_INVALID_TYPE' ? 400 :
      403;
    return NextResponse.json(
      { ok: false, error: { code, message: 'Export generation failed.' } },
      { status },
    );
  }

  const { artifact, downloadUrl } = result.result;

  return NextResponse.json({
    ok: true,
    data: {
      exportId: artifact.exportId,
      exportType: artifact.exportType,
      filename: artifact.filename,
      contentType: artifact.contentType,
      checksumSha256: artifact.checksumSha256,
      generatedAt: artifact.generatedAt,
      downloadUrl,
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { registryId: string } },
) {
  const { registryId } = params;
  const accessToken = req.nextUrl.searchParams.get('access_token') ?? '';
  const limitParam = req.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 100) : 50;

  if (!accessToken) {
    return NextResponse.json(
      { ok: false, error: { code: 'REGISTRY_EXPORT_ACCESS_DENIED', message: 'access_token is required.' } },
      { status: 403 },
    );
  }

  const result = listRegistryExports({ registryId, accessToken, limit });

  if (!result.ok) {
    const code = result.errorCode ?? 'REGISTRY_EXPORT_ACCESS_DENIED';
    const status = code === 'REGISTRY_NOT_FOUND' ? 404 : 403;
    return NextResponse.json(
      { ok: false, error: { code, message: 'Registry access denied.' } },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    data: { exports: result.exports ?? [] },
  });
}
