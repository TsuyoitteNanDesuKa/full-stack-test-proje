# Test etiketleri ve gerekçeleri

Bu belge, pytest işaretçilerinin (`apps/api/pyproject.toml`) ve Playwright etiketlerinin (`describe` başlıkları) hangi testi neden o etikete aldığını tanımlar. Her etiket için tek cümlelik kabul kriteri verilir. Etiket dağılımı, dosya taraması ile doğrulanmıştır (22 Kasım 2026).

## Pytest işaretçileri (`apps/api`)

| Etiket | Kriter | Kullanım (dosya sayısı) | Nerede koşar |
|---|---|---|---|
| `smoke` | Kritik davranışı hızlıca doğrulayan, her PR'da koşması gereken test. | 3 | PR (`backend`) |
| `regression` | Önceki hatalarda kırılan ve her PR'da korunması gereken iş kuralı testi. | 2 | PR (`backend`) |
| `integration` | Uygulama ile altyapı sınırını (DB, dış servis) aşan test. | 2 | PR (`backend`) |
| `security` | Kimlik doğrulama, yetkilendirme veya güvenli loglama davranışını sınayan test. | 3 | PR (`backend`) |
| `postgres` | Dedicated PostgreSQL test veritabanı gerektiren test (`SHOP_TEST_DATABASE_URL`). | 1 | PR (`postgres`, ayrı job) |
| `keycloak` | Canlı Keycloak realm'i gerektiren test. | **0** | Tanımlı, kullanılmıyor |
| `performance` | Yük veya performans ölçümü; PR kapısı dışında. | **0** | Tanımlı, kullanılmıyor |

**Bulgu:** `keycloak` ve `performance` işaretçileri `pyproject.toml`'da tanımlı ancak hiçbir pytest testinde kullanılmıyor. Canlı Keycloak testleri Playwright tarafında (`@keycloak`) yapılır. `performance` ölçümleri ise `performance/` klasöründeki betiklerle yapılır. Bu iki işaretçi kaldırılabilir ya da ilgili testlere bağlanabilir (açık iş).

## Playwright etiketleri (`apps/web/e2e`)

| Etiket | Kriter | Dosyalar | Nerede koşar |
|---|---|---|---|
| `@smoke` | Deterministik (Keycloak gerektirmeyen), kritik kullanıcı akışı; PR'da koşar. | `accessibility` (QA-017, P2, QA-023), `order-cancellation` (REQ-018), `order-pagination`, `product-detail` (REQ-020), `qa-019-deterministic` | PR (`e2e`) |
| `@keycloak` | Canlı Keycloak ve/veya Mailpit gerektiren, gerçek kimlik sağlayıcı davranışı. | `login`, `admin-access`, `admin-crud`, `cart` (REQ-009/010/012), `seller-applications`, `seller-orders`, `email-verification-reset` | Gece ve elle (`keycloak-e2e`) |

**Bilinen durum:** `@regression`, `@security` ve `@performance` Playwright etiketleri kullanılmıyor; regresyon ve güvenlik davranışı `@keycloak` ve `@smoke` içinde yer alır.

## Neden bu ayrım

- **PR kapısı hızlı ve deterministik olmalı.** `@smoke` ve pytest işaretçileri, dış servis gerektirmeden dakikalar içinde koşar.
- **Gerçek kimlik sağlayıcı pahalı ve kırılgan.** `@keycloak` yalnızca gece ve elle tetiklenir; PR'da flaky bir dış servis sinyali üretmez. Bu karar REQ-019 PR kapısı ölçümüyle (QA-032) yeniden değerlendirilecek.
- **Performans PR kapısı değildir.** Ölçümler yavaş ve ortama duyarlıdır; sonuçlar `docs/performance-*.md` içinde raporlanır.

## Açık işler

1. `keycloak` ve `performance` pytest işaretçilerini ya kullanmak ya da kaldırmak.
2. `@regression` ve `@security` Playwright etiketlerinin gerekip gerekmediğine karar vermek.
