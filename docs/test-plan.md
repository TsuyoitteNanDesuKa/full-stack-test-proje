# Test planı — Çevrimiçi alışveriş uygulaması (v1.0.0 ve sonrası)

Bu belge, projenin test kapsamını, risklerini, test seviyelerini ve kalite kararlarının kanıtlarını tek yerde toplar. Gereksinim ayrıntıları [requirements.md](./requirements.md), kapsam ölçüm kuralları [coverage-policy.md](./coverage-policy.md), CI kapıları [README.md](../README.md#kalite-kapıları) içindedir. Bu belge yeni davranış tanımlamaz; mevcut kaynaklara bağlanır.

## 1. Amaç ve kapsam

**Amaç:** Yerel öğrenme amaçlı marketplace'in kritik iş kurallarını, güvenlik sınırlarını ve kullanıcı akışlarını test seviyelerine dağıtmak; her kalite kararını ölçülebilir bir kanıta bağlamak.

**Kapsam içinde:**
- Keycloak ile kayıt, giriş, e-posta doğrulama ve parola sıfırlama (REQ-001, REQ-006, REQ-019).
- Rol sınırları: buyer, seller (yalnızca onaylı başvuru), admin (REQ-007, REQ-008, REQ-016).
- Ürün katalogu, arama/filtre/sıralama, ürün detayı (REQ-002–005, REQ-013, REQ-020).
- Sepet, adres defteri, teslimat ücretleri, sipariş oluşturma (REQ-009, REQ-010, REQ-015).
- Yerel/mock ödeme, imzalı webhook, süre dolumu ve stok geri yükleme (REQ-011).
- Sipariş takibi, alıcı iptali, yerel iade, çok satıcılı fulfillment (REQ-012, REQ-014, REQ-017, REQ-018).
- API sözleşmesi, erişilebilirlik, bağımlılık güvenliği, PostgreSQL uyumluluğu (QA-016–QA-025).

**Kapsam dışında:** Gerçek ödeme sağlayıcısı (PSP) ve para hareketi, kargo/taşıyıcı entegrasyonu, KYC/KYB ve resmi satıcı doğrulaması, sosyal giriş, MFA, mobil uygulama, mikroservisler, gerçek e-posta gönderimi. İlgili akışlar yerel/mock davranışlarla sınanır.

## 2. Test hedefleri ve kalite kararı

| Karar | Kanıt |
|---|---|
| Yetkisiz kullanıcı ürün yazamaz, sipariş yönetemez | API rol testleri (403), `admin-access` ve seller E2E |
| Ödeme ve iade durumu tutarlı, tekrar güvenli | Webhook imza/idempotency testleri, PostgreSQL eşzamanlılık testleri |
| Stok iki kez geri yüklenmez | `payment_expiry` ve iade testleri, PostgreSQL integration |
| Parola ve token uygulama/API sınırını geçmez | REQ-019 E2E parola/token gizlilik denetimi |
| Doğrulanmamış hesap giriş yapamaz | REQ-019 E2E (canlı Keycloak) |
| Erişilebilirlik temel akışlarda bozulmaz | QA-017/023 axe taramaları, klavye E2E |
| API sözleşmesi kaymaz | OpenAPI snapshot + istemci tip kontrolü (CI) |
| Yalnız bilinen güvenlik açığı olmayan bağımlılık | pip-audit (kilitli liste), npm audit (`--audit-level=low`) |

## 3. Risk matrisi

Olasılık ve etki 1–3 ölçeğinde (3 = yüksek). Risk puanı = olasılık × etki.

| ID | Risk | Olasılık | Etki | Puan | Test seviyesi | Kanıt / durum |
|---|---|---|---|---|---|---|
| R1 | Buyer, admin veya seller mutation'ı yetkisiz yapar | 2 | 3 | 6 | API, E2E | Rol testleri (403), `admin-access.spec.ts` — geçiyor |
| R2 | Doğrulanmamış hesap giriş yapar | 2 | 3 | 6 | Keycloak E2E | REQ-019 senaryo 1 — geçiyor (gece koşusu) |
| R3 | Parola veya token API/loglara/tarayıcı depolamasına sızar | 2 | 3 | 6 | Keycloak E2E, unit | REQ-019 senaryo 7 + `test_main_coverage_gaps` loglama testi — geçiyor |
| R4 | Webhook tekrarı veya sahte imza ödemeyi değiştirir | 2 | 3 | 6 | API, PostgreSQL | Webhook imza/idempotency testleri — geçiyor |
| R5 | Stok iki kez geri yüklenir (expiry/iade yarışı) | 2 | 3 | 6 | PostgreSQL eşzamanlılık | `-m postgres` (22 test, toplama ile doğrulandı) — geçiyor; SQLite'da yarış kapsanmaz (coverage-policy B) |
| R6 | İade ve sipariş durumu tutarsız kalır | 2 | 2 | 4 | API, PostgreSQL | Durum geçiş matrisi, transaction testleri |
| R7 | API sözleşmesi istemciyle kayar | 2 | 2 | 4 | Contract | OpenAPI snapshot + `contract:check` (CI) |
| R8 | Erişilebilirlik regresyonu (klavye, odak, kontrast) | 2 | 2 | 4 | E2E, axe | QA-017/023; **manuel NVDA incelemesi yok** (QA-037) |
| R9 | Yavaş yükleme ve performans hedefleri tutmaz | 3 | 2 | 6 | Performans | QA-026/027 ölçümleri; **hedefler tutmadı** (QA-036) |
| R10 | Kimlik sağlayıcısı kurulumu eski volume ile uyumsuz kalır | 2 | 2 | 4 | Dokümantasyon, config testi | `test_keycloak_config.py`; README kurulum notu (QA-030) |
| R11 | Flaky E2E kırmızı build üretir, güven azalır | 2 | 2 | 4 | E2E | Gözlem: erişilebilirlik testinde bir kez zaman aşımı (QA-038 açık) |
| R12 | Bağımlılık güvenlik açığı | 2 | 3 | 6 | Güvenlik taraması | pip-audit ve npm audit CI kapısı; upstream tartışmalı advisory istisnası (ROADMAP P0 notu) |
| R13 | Kapsam yüzdesi yanıltıcı güven üretir | 2 | 1 | 2 | Politika | `coverage-policy.md` A/B/C sınıflandırması |
| R14 | Gece koşusu sessizce kırılır, PR bunu görmez | 2 | 2 | 4 | CI | `@keycloak` yalnızca gece koşar (README kalite tablosu, QA-031) |

**Açık riskler:** R5 yalnızca PostgreSQL koşusuna bağlı; R8 ve R9 manuel/ölçüm kanıtı bekliyor; R11 ve R14 için karar bekleniyor (QA-032).

## 4. Test seviyeleri

| Seviye | Araç | Kapsam | Nerede koşar |
|---|---|---|---|
| Backend unit/API | pytest, FastAPI TestClient, SQLite | İş kuralları, rol sınırları, webhook, iade (425 toplanan testin 403'ü PostgreSQL dışı koşuda) | PR (`backend`) |
| Backend coverage kapısı | pytest-cov, `fail_under = 95` | `src/shop_api` kaynak kapsamı | PR (`backend`) |
| PostgreSQL integration | pytest `-m postgres`, PostgreSQL 17 | Migration, kısıt, eşzamanlılık | PR (`postgres`) |
| Sözleşme | OpenAPI snapshot, jsonschema, `openapi-typescript-codegen` | API/istemci uyumu | PR (`backend`, `frontend`) |
| Frontend component | Vitest, Testing Library | Panel durumları, form doğrulama | PR (`frontend`) |
| Build ve statik analiz | oxlint, TypeScript, Ruff, Vite | Tip, lint, format | PR |
| Bağımlılık güvenliği | pip-audit, npm audit | Bilinen zafiyet | PR |
| Smoke E2E (deterministik) | Playwright, test JWKS, SQLite | Buyer checkout, REQ-018/020, sayfalama, erişilebilirlik | PR (`e2e`, `@smoke`) |
| Keycloak E2E | Playwright, gerçek Keycloak, Mailpit | Kayıt, giriş, doğrulama, sıfırlama, rol akışları | Gece ve elle (`keycloak-e2e`, `@keycloak`) |
| Erişilebilirlik | axe, klavye E2E | WCAG 2.1 A/AA otomatik kontrol | PR (`@smoke`), manuel NVDA planlanıyor |
| Performans | k6 benzeri yük, `performance/` ölçümleri | Sayfalı endpoint'ler, frontend yükleme | Elle; hedefler tutmadı |

## 5. Giriş ve çıkış kriterleri

**Giriş (bir özelliğin teste başlaması için):**
- Gereksinim `requirements.md` içinde kabul kriterleriyle tanımlı.
- Her kriter en az bir test seviyesine atanmış.
- Kapsam dışı davranış belirtilmiş.

**Çıkış (bir özelliğin tamamlanması için):**
- Tüm kabul kriterleri geçen testlerle kanıtlanmış veya "kanıtlanmadı" olarak açıkça işaretlenmiş.
- PR kalite kapıları (backend, postgres, frontend, e2e smoke) yeşil.
- Yeni kod yolu için coverage-policy sınıfı (A/B/C) belirtilmiş.
- Keycloak etkisi varsa gece koşusu gözlemlenmiş.

**Sürüm çıkış kapısı:** ROADMAP "v1.0 çıkış kapısı" ve `docs/release-notes-v1.0.0.md` içindeki kalite tablosu.

## 6. Ortamlar

| Ortam | Kimlik | Veritabanı | E-posta | Amaç |
|---|---|---|---|---|
| Yerel geliştirme | Docker Keycloak (`shop`) | Docker PostgreSQL 17 | Mailpit (127.0.0.1:8025) | Manuel test ve geliştirme |
| PR CI | Test JWKS (deterministik) veya ephemeral Keycloak | SQLite ve PostgreSQL 17 servisi | Yok (smoke) | Hızlı geri bildirim |
| Gece CI | Ephemeral Keycloak (`qa-020-ephemeral-ci-only`) | SQLite | Mailpit (compose) | Gerçek Keycloak regresyonu |

Tüm kimlik bilgileri yalnızca yerel veya CI ortamı değişkenlerindedir; kaynakta gerçek sır yoktur.

## 7. Kabul ölçütleri (plan kendi kalitesi için)

- Her risk R1–R14 bir test seviyesine ve bir kanıta bağlıdır (yukarıdaki tablolar).
- Açık riskler ya kapanır ya da ROADMAP'te bir maddeye bağlanır.
- Plan, her sürümde gözden geçirilir; yeni gereksinim eklendiğinde risk matrisi güncellenir.

## 8. Bilinen sınırlar

- Kullanıcı kabulü (UAT) ve gerçek kullanıcılarla test yapılmamıştır.
- Güvenlik testi OWASP ZAP gibi bir DAST aracıyla yapılmamıştır; yalnızca bağımlılık taraması ve uygulama içi negatif testler vardır.
- Performans hedefleri karşılanmamıştır (QA-036).
- Manuel erişilebilirlik incelemesi yapılmamıştır (QA-037).
