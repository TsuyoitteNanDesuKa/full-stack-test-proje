# Liva — Marketplace Portfolyo Projesi

Alıcı, satıcı ve admin rollerine sahip, Keycloak (OIDC) ile korunan full-stack bir çevrimiçi alışveriş uygulaması: ürün kataloğu, sepet, sipariş, mock ödeme, satıcı başvurusu ve satıcı sipariş operasyonları.

> **Şeffaflık notu — vibe coding:** Kodun büyük bölümü yapay zekâ asistanlarıyla ("vibe coding") yazıldı. Benim rolüm; gereksinimleri tanımlamak, mimari ve kapsam kararlarını vermek, testlerle ve CI kalite kapılarıyla çıktıyı doğrulamak ve sonuçları gözden geçirmekti. Bu yüzden değer, satır sayısından çok **doğrulama disiplininde** aranmalı: aşağıdaki "İnceleyenler için" bölümü bunun kanıtlarına götürür.

Gerçek ödeme/PSP, kargo ve KYC/KYB entegrasyonları kapsam dışıdır; bu akışlar yerel/mock davranışlarla sınanır.

## Teknoloji

FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL · Keycloak · React 19 · TypeScript · Vite · pytest · Vitest · Playwright · GitHub Actions · k6

## Mimari

```text
React/Vite (5173) ──OIDC (Authorization Code + PKCE)──▶ Keycloak (8080)
        │ Bearer token
        ▼
FastAPI (8000) ── JWKS/issuer/audience doğrulaması ──▶ Keycloak
        │
        ▼
PostgreSQL (5432)        Mailpit (8025): yerel e-posta (doğrulama / parola sıfırlama)
```

Hızlı API ve Playwright testleri gerçek Keycloak yerine geçici OIDC/JWKS ve SQLite kullanır.

## Demo çalıştırma

Gereksinimler: Docker (Compose v2), [uv](https://docs.astral.sh/uv/) (Python ≥ 3.13'ü uv indirir), Node.js LTS.

**Seçenek A — Hızlı doğrulama (Docker/Keycloak gerekmez):** tarayıcı E2E'si geçici API, SQLite ve test OIDC sağlayıcısıyla alıcı → sepet → checkout → mock ödeme akışını koşar.

```bash
cd apps/web
npm ci
npx playwright install chromium   # Linux'ta gerekirse --with-deps
npm run test:e2e:smoke
```

**Seçenek B — Tam yerel uygulama (3 terminal):**

```bash
# 1) Kökte: PostgreSQL + Keycloak (+ Mailpit)
export KEYCLOAK_ADMIN_PASSWORD='yerel-bir-parola'   # PowerShell: $env:KEYCLOAK_ADMIN_PASSWORD = '...'
docker compose up -d postgres keycloak

# 2) API
cd apps/api
uv sync
cp -n .env.example .env          # PowerShell: Copy-Item .env.example .env
uv run alembic upgrade head
uv run uvicorn shop_api.main:create_app --factory --reload --no-access-log

# 3) Web
cd apps/web
npm ci
cp -n .env.example .env
npm run dev
```

Keycloak ilk açılışta realm'i içe aktarır (~30–60 sn); `http://localhost:8080/realms/shop` yanıt verince hazırdır.

| Adres | Ne |
|---|---|
| `http://localhost:5173` | Uygulama — **Alıcı hesabı oluştur** ile kayıt olun |
| `http://127.0.0.1:8000/docs` | API / OpenAPI arayüzü |
| `http://localhost:8080/admin` | Keycloak yönetim (admin rolü yalnızca buradan verilir) |
| `http://localhost:8025` | Mailpit (e-posta doğrulama/sıfırlama postaları) |

- Satıcı onayının çalışması için API'nin Keycloak service-account secret'ı gerekir: [API README → Seller role provisioning](./apps/api/README.md#seller-role-provisioning).
- Temizlik: `docker compose down` (veriyi korur), `docker compose down -v` (volume'leri de siler).

## Testleri çalıştırma

```bash
# Backend (SQLite, izole) — apps/api içinde
uv run pytest

# Frontend — apps/web içinde
npm run lint && npm test
npm run test:e2e:smoke
```

> Backend testleri geliştirme `.env` dosyası mevcutken (`SHOP_DATABASE_URL` PostgreSQL'e işaret eder) başarısız olabilir; `uv run pytest`'i `.env` olmayan bir checkout'ta veya dosyayı geçici olarak kenara alarak çalıştırın.

PostgreSQL entegrasyonu, gerçek Keycloak E2E, sözleşme ve erişilebilirlik komutları ilgili README'lerde: [API](./apps/api/README.md), [Web](./apps/web/README.md). Keycloak senaryolarını listelemek için: `E2E_KEYCLOAK_E2E=1 npm run test:e2e:keycloak -- --list`.

## Dosya yapısı

```text
apps/
  api/                  FastAPI uygulaması
    src/shop_api/         routes/ (auth, products, cart, orders, payments, seller_*...), models, security
    migrations/           Alembic migration'ları
    tests/                pytest (unit, API, PostgreSQL entegrasyon)
    scripts/              OpenAPI snapshot üretimi/kontrolü
  web/                  React + TypeScript istemcisi
    src/                  paneller (Cart, Orders, Admin...) ve component testleri (Vitest)
    e2e/                  Playwright senaryoları, fixture'lar, test OIDC sağlayıcısı
infra/keycloak/         Realm export + "liva" login teması
performance/            k6 yük, SQL tanı ve frontend lab araçları
security/dast/          ZAP Baseline (pasif DAST) pilotu
scripts/                CI özet raporu üretimi
docs/                   Gereksinimler, test planı/stratejisi, raporlar, bug raporları
.github/workflows/      ci.yml, dast.yml
docker-compose.yml      PostgreSQL, Keycloak, Mailpit
ROADMAP.md              Aşamalar ve kararlar
```

## İnceleyenler için: nereye bakmalı?

Yapay zekâyla üretilen kodda asıl soru "kim yazdı" değil, "nasıl doğrulandı". Önerilen sıra:

1. **Gereksinimden teste izlenebilirlik** — [docs/requirements.md](./docs/requirements.md) (REQ/QA kabul kriterleri), [test-plan.md](./docs/test-plan.md), [test-strategy.md](./docs/test-strategy.md). Kararlar [ROADMAP.md](./ROADMAP.md) içinde kayıtlı.
2. **Güvenlik modeli** — [dependencies.py](./apps/api/src/shop_api/dependencies.py): JWKS, issuer, audience ve rol doğrulaması; parolalar API'ye hiç uğramaz. Realm: [infra/keycloak](./infra/keycloak).
3. **İş kuralları** — [order_lifecycle.py](./apps/api/src/shop_api/order_lifecycle.py), [payment_providers.py](./apps/api/src/shop_api/payment_providers.py) (imzalı webhook, expiry) ve [orders.py](./apps/api/src/shop_api/routes/orders.py) (idempotent checkout), [seller_orders.py](./apps/api/src/shop_api/routes/seller_orders.py) (satıcı izolasyonu).
4. **Test piramidi ve sınıflandırma** — pytest marker'ları ve Playwright `@smoke`/`@keycloak` etiketleri; [apps/api/tests](./apps/api/tests), [apps/web/e2e](./apps/web/e2e), [coverage-policy.md](./docs/coverage-policy.md).
5. **Sözleşme testi** — OpenAPI snapshot'ı ([docs/openapi.json](./docs/openapi.json)) ve istemci tip uyumu; [karar kaydı](./docs/contract-testing-decision.md).

### Sıradan bir projeden ayıran alanlar

- **Gerçek kimlik sağlayıcı:** Kendi yazdığımız auth yerine Keycloak OIDC/PKCE; satıcı onayında service-account ile rol provisioning.
- **Dürüst performans çalışması:** Sipariş geçmişinde N+1 (6.001 → 13 sorgu, p95 44,2 sn → 2,3 sn) ölçülüp düzeltildi; hedef (500 ms) yine de kaçırıldı ve bu saklanmadı. Bkz. [SQL analizi](./docs/performance-sql-analysis-2026-11-14.md), [yük karşılaştırması](./docs/performance-load-after-sql-2026-11-15.md), [performance/](./performance/README.md).
- **Katmanlı CI kapıları:** PR'da hızlı/deterministik kontroller, gece gerçek Keycloak E2E ve DAST (aşağıdaki tablo).
- **Erişilebilirlik:** axe WCAG 2.1 A/AA taraması ve klavye/odak testleri ([manuel plan](./docs/manual-accessibility-plan.md)).
- **Kayıtlı hatalar:** Gerçek hata raporları ve kök nedenleri [docs/bug-reports](./docs/bug-reports).
- **Bilinen sınırlar açık yazılı:** [v1.0.0 sürüm notları](./docs/release-notes-v1.0.0.md).

## Kalite kapıları

`.github/workflows/ci.yml` ile eşleşir.

| Kontrol | Job | Push / PR | Gece (02:00 UTC) / elle |
|---|---|---|---|
| Ruff, OpenAPI snapshot, pip-audit, pytest (SQLite, `fail_under = 95`) | `backend` | Evet | Evet |
| PostgreSQL migration ve entegrasyon testleri | `postgres` | Evet | Evet |
| Lint, tip, OpenAPI sözleşmesi, Vitest, build, npm audit | `frontend` | Evet | Evet |
| Playwright `@smoke` (Keycloak gerektirmez) | `e2e` | Evet | Evet |
| Playwright `@keycloak` (gerçek Keycloak + Mailpit) | `keycloak-e2e` | Hayır | Evet |

DAST pilotu ([dast.yml](./.github/workflows/dast.yml)) yalnız gece/elle çalışır, PR kapısı değildir; kimlik doğrulamasız ve pasif taramadır. Her koşunun **Unified test report** özeti sonuçları ve coverage'ı tek tabloda toplar.

## Sürüm

Güncel etiket [`v1.0.0`](https://github.com/TsuyoitteNanDesuKa/full-stack-test-proje/releases/tag/v1.0.0). Yol haritası: [ROADMAP.md](./ROADMAP.md).
