import fs from 'fs';
import path from 'path';

export interface BuildAuthConfigOptions {
  configFileCandidates?: string[];
  outputDir?: string;
  outputFilename?: string;
  envVarName?: string;
  defaultRedirectPathPrefix?: string;
}

export function generatePublicAuthConfig(options?: BuildAuthConfigOptions): { count: number; outputPath: string } {
  const envVar = options?.envVarName || 'OIDC_PROVIDERS_CONFIG';
  let configRaw = process.env[envVar] || '';
  let sourcePath = `${envVar} environment variable`;

  const candidates = options?.configFileCandidates || [
    'oidc-config.json',
    '../oidc-config.json',
    'oidc-config.template.json',
    '../oidc-config.template.json',
  ];

  if (!configRaw) {
    for (const p of candidates) {
      const resolved = path.resolve(process.cwd(), p);
      if (fs.existsSync(resolved)) {
        configRaw = fs.readFileSync(resolved, 'utf-8');
        sourcePath = p;
        break;
      }
    }
  }

  let providers: any[] = [];
  if (configRaw) {
    try {
      const parsed = JSON.parse(configRaw);
      const rawList = parsed.auth_providers || [];
      const prefix = options?.defaultRedirectPathPrefix || '/api/auth/callback';
      providers = rawList.map((p: any) => ({
        id: p.id,
        name: p.name,
        icon: p.icon || p.id,
        authority: p.issuer || p.authority,
        client_id: p.client_id,
        redirect_path: p.redirect_path || `${prefix}/${p.id}`,
      }));
    } catch (e) {
      console.warn(`[tsutils/tools] Warning: failed to parse OIDC config from ${sourcePath}:`, e);
    }
  }

  const outDir = path.resolve(process.cwd(), options?.outputDir || 'public');
  fs.mkdirSync(outDir, { recursive: true });
  const filename = options?.outputFilename || 'auth-config.json';
  const outPath = path.resolve(outDir, filename);

  fs.writeFileSync(outPath, JSON.stringify({ auth_providers: providers }, null, 2), 'utf-8');
  console.log(`✓ Extracted ${providers.length} public auth providers from ${sourcePath} -> ${path.relative(process.cwd(), outPath)}`);
  return { count: providers.length, outputPath: outPath };
}
