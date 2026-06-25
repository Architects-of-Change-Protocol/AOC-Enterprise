/**
 * GET /api/organization-registry/[registryId]/exports/[exportId]
 *   Download a specific export artifact.
 *   Requires valid access_token query param.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRegistryExportForDownload } from '@/lib/registry-export-service';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { registryId: string; exportId: string } },
) {
  const { registryId, exportId } = params;
  const accessToken = req.nextUrl.searchParams.get('access_token') ?? '';

  if (!accessToken) {
    return NextResponse.json(
      { ok: false, error: { code: 'REGISTRY_EXPORT_ACCESS_DENIED', message: 'access_token is required.' } },
      { status: 403 },
    );
  }

  const result = getRegistryExportForDownload({ registryId, accessToken, exportId });

  if (!result.ok || !result.artifact) {
    const code = result.errorCode ?? 'REGISTRY_EXPORT_ACCESS_DENIED';
    const status =
      code === 'REGISTRY_EXPORT_NOT_FOUND' ? 404 :
      code === 'REGISTRY_NOT_FOUND' ? 404 :
      403;
    return NextResponse.json(
      { ok: false, error: { code, message: code === 'REGISTRY_EXPORT_NOT_FOUND' ? 'Export not found.' : 'Registry access denied.' } },
      { status },
    );
  }

  const artifact = result.artifact;

  return new NextResponse(artifact.contentText, {
    status: 200,
    headers: {
      'Content-Type': artifact.contentType,
      'Content-Disposition': `attachment; filename="${artifact.filename}"`,
      'X-AOC-Export-Id': artifact.exportId,
      'X-AOC-Checksum-SHA256': artifact.checksumSha256,
      'Cache-Control': 'no-store',
    },
  });
}
