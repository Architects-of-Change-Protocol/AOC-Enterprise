# IP & Legal Due Diligence Checklist

> STATUS: DRAFT — PENDING PROFESSIONAL LEGAL REVIEW.
> "Estado: Disponible" below means verifiable directly from this
> repository's contents as of 2026-07-14. Items that require records
> outside this repository (contracts, entity filings, account access)
> are marked accordingly and must not be treated as available until
> produced and verified.

| Evidencia | Estado | Ubicación | Owner | Bloquea transacción |
|---|---|---|---|---|
| Entity ownership (Onchainfest LLC formation/good standing) | No disponible en el repositorio — requiere registro estatal/corporativo externo | N/A (fuera del repo) | Founder / Legal | Sí |
| IP assignment (founder → Onchainfest LLC) | No disponible en el repositorio | N/A (fuera del repo) | Founder / Legal | Sí |
| Employee agreements (IP assignment clauses) | No disponible en el repositorio | N/A (fuera del repo) | Founder / Legal / HR | Sí, si hay empleados con acceso al código |
| Contractor agreements (IP assignment clauses) | No disponible en el repositorio | N/A (fuera del repo) | Founder / Legal | Sí, si hay contratistas con acceso al código |
| CLA (Contributor License Agreement) | Proceso documentado en `CONTRIBUTING.md` (Fase 6 de este sprint); ningún CLA firmado real está en el repositorio | `CONTRIBUTING.md` | Founder / Legal | No, actualmente (no se detectaron contribuciones externas no autorizadas), pero sí antes de aceptar contribuciones externas |
| Repository access (who has write/admin access) | No verificable desde el contenido del repositorio (requiere consola de GitHub) | N/A (GitHub org settings) | Founder / Eng lead | Sí, para due diligence de seguridad |
| Branch protection | No verificable desde el contenido del repositorio (requiere GitHub settings); no existe `CODEOWNERS` en el repo, lo cual sugiere que la revisión obligatoria por dueño de código no está configurada a nivel de archivo | GitHub repo settings (no auditable aquí) | Founder / Eng lead | No bloqueante para IP, pero es una brecha de gobernanza a documentar |
| Code provenance | Parcialmente disponible — el historial de git y `docs/architecture/ADR-*.md` documentan decisiones de diseño; no existe un registro formal de procedencia por archivo | `git log`, `docs/architecture/ADR-*.md` | Eng lead | No bloqueante actualmente (sin código de terceros vendorizado detectado) |
| AI-generated code policy | Antes de este sprint: no existía. Ahora existe una sección en `CONTRIBUTING.md` que exige declarar el uso de herramientas de IA en cada contribución | `CONTRIBUTING.md` | Founder / Legal | No, pero recomendable formalizar antes de una transacción |
| Open source inventory | Disponible — creado en este sprint | `docs/legal/OPEN_SOURCE_DEPENDENCIES.md` | Eng lead | No |
| Third-party notices | Disponible (parcial) — creado en este sprint; pendiente generación de textos de licencia verbatim antes de distribución externa | `docs/legal/THIRD_PARTY_NOTICES.md` | Eng lead | No, salvo distribución externa inminente |
| Copyright | Disponible — creado en este sprint | `COPYRIGHT.md` | Legal | No |
| Trademarks | Disponible como declaración interna; **estado de registro real no verificado** (no hay evidencia de registro en ninguna jurisdicción) | `TRADEMARKS.md` | Founder / Legal | Sí, si la transacción depende de marcas registradas específicamente |
| Domain ownership | No disponible en el repositorio | N/A (fuera del repo) | Founder | Sí, si la transacción incluye activos de dominio |
| Release artifacts | Disponible — manifest con checksums SHA-256 por artefacto (no hay firma criptográfica ni capa de no repudio; ver `docs/release/TECHNICAL_DUE_DILIGENCE_V1.md` Finding DD-4) | `release/RELEASE_MANIFEST.json`, `CHANGELOG.md` | Eng lead | No |
| SBOM (Software Bill of Materials) | No disponible en formato estándar (SPDX/CycloneDX); existe inventario manual equivalente | `docs/legal/OPEN_SOURCE_DEPENDENCIES.md`, `docs/release/DEPENDENCY_AUDIT_V1.md` | Eng lead | No actualmente, pero recomendable automatizar antes de una transacción formal |
| Security reports | Disponible — threat model, hardening report, addendum | `docs/security/THREAT_MODEL_V1.md`, `docs/security/THREAT_MODEL_V1_ADDENDUM.md`, `docs/security/SECURITY_HARDENING_V1.md` | Eng lead | No |
| Security reporting channel | Founder-designated initial channel — `vicvalch@onchainfest.xyz` (`[SECURITY REPORT]`), primary owner Víctor Valverde. Partial: designated and documented; no evidence in this repository of operational testing, 24/7 monitoring, or a backup owner. Backup owner remains "not yet designated" — an operational gap, not evidence the channel is nonexistent | `SECURITY.md` | Founder | No, si el canal designado se considera suficiente para el estado actual; sí, si la contraparte exige monitoreo probado, cobertura de respaldo, o un SOC/CISO formal |
| Customer contracts | No disponible en el repositorio | N/A (fuera del repo) | Founder / Sales / Legal | Sí, si la transacción depende de ingresos o clientes existentes |
| Pilot agreements | No disponible en el repositorio | N/A (fuera del repo) | Founder / Legal | Sí, si hay pilotos activos relevantes a la transacción |
| Data processing agreements (DPA) | No disponible en el repositorio | N/A (fuera del repo) | Founder / Legal | Sí, si se procesan datos de clientes bajo obligaciones de protección de datos |
| Support terms | No disponible en el repositorio | N/A (fuera del repo) | Founder / Legal | Sí, si la transacción depende de obligaciones de soporte contractual |
| Export controls | No disponible en el repositorio — no se encontró política de control de exportaciones | N/A (fuera del repo) | Founder / Legal | Sí, si el software o los clientes están sujetos a regímenes de control de exportación (p. ej. EAR/ITAR) |
| Privacy documentation | No disponible en el repositorio — no se encontró política de privacidad ni documentación de bases legales de tratamiento de datos personales más allá de la mención conceptual de "legal basis metadata" en `docs/architecture/foundation.md` | `docs/architecture/foundation.md` (mención conceptual únicamente) | Founder / Legal | Sí, si el producto procesa datos personales de usuarios finales |

## How to read "Bloquea transacción"

"Sí" means this item is commonly required by a counterparty's legal or
technical due diligence team before closing a transaction (investment,
acquisition, or a significant commercial agreement), and this repository
alone does not provide sufficient evidence to satisfy that requirement.
It does not mean the underlying fact is false or missing in reality —
only that this repository cannot verify it. Marking an item "No
disponible" here is not a claim that Onchainfest LLC lacks the
underlying agreement or right; it means this codebase is not the source
of truth for that evidence and it must be produced separately.

## Summary of blocking gaps as of this writing

The items most likely to block a transaction, based purely on what this
repository can and cannot verify, are: entity ownership records, IP
assignment instruments, employee/contractor agreements, domain
ownership, customer/pilot contracts, DPAs, support terms, export
control review, and privacy documentation. None of these can be
produced from repository contents; all require records maintained
outside this codebase.
