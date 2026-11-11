# Full-stack Alışveriş Uygulaması — QA Öğrenme Projesi

Bu proje, çevrimiçi alışveriş uygulamasını Agile yaklaşımla gereksinimlerden başlayarak geliştirirken yazılım testinin her seviyesini uygulamalı öğrenmek için hazırlanmıştır. Amaç yalnızca çalışan bir uygulama çıkarmak değil; testleri doğru seviyede tasarlamak, otomatikleştirmek, sonuçlarını yorumlamak ve kalite kararlarını kanıta dayandırmaktır. Ürün gereksinimleri [docs/requirements.md](./docs/requirements.md) dosyasında tutulur.

## Öğrenme hedefleri

- Bir ürün fikrini test edilebilir gereksinimlere ve kabul kriterlerine dönüştürmek.
- Modern web uygulamasının istemci, API ve veritabanı katmanlarını kurup birbirine bağlamak.
- Unit test'ten entegrasyon, API, sistem ve uçtan uca testlere kadar farklı test seviyelerini uygulamak.
- Risk temelli test tasarımı, test verisi yönetimi, hata raporlama ve regresyon yaklaşımını pratik etmek.
- Testleri CI hattında çalıştırmak; rapor, log ve kalite kapılarını değerlendirmek.
- Teknik ayrıntıları projenin ihtiyacı kadar öğrenmek; gereksiz altyapı karmaşıklığından kaçınmak.

## API sözleşme kontrolü

OpenAPI snapshot'ı ve istemci modelleri sürümlenir; kontroller sunucu, PostgreSQL veya Keycloak gerektirmez:

```powershell
Set-Location apps/api
uv run python scripts/openapi_contract.py --check
uv run pytest tests/test_openapi_contract.py --no-cov
Set-Location ../web
npm ci
npm run contract:check
npm run test -- src/api.openapi.test.ts
```

Kasıtlı API değişikliğinde önce `apps/api` içinde `uv run python scripts/openapi_contract.py`, sonra `apps/web` içinde `npm run contract:generate` çalıştırın; üretilen farkları inceleyin ve kontrolleri yeniden çalıştırın. İstemcinin sözleşmeden yararlandığı yeni çağrılar için `api.openapi.test.ts` ve `api.contract.ts` eşlemelerini de güncelleyin.

Bu kontroller şema drift'i, tanımlanmış istemci modellerinin tip uyumu ve test edilen çağrıların yol/yöntem/başlıklarını kontrol eder. Gerçek yanıtların şemaya karşı çalışma zamanı doğrulaması, tüm doğrulama sınırları ve yeni istemci fonksiyonlarının otomatik keşfi kapsamda değildir; API ve E2E testlerinin yerini almaz.

## Erişilebilirlik kontrolleri

Kritik buyer/admin arayüzlerinde axe WCAG 2.1 A/AA taraması ve klavye/odak kontrolleri web regresyon paketine dahildir. Tarayıcı gerektiren gerçek giriş ekranı denetimi için:

```powershell
Set-Location apps/web
npm ci
npx playwright install chromium
npx playwright test e2e/accessibility.spec.ts
```

Komponent axe taramaları JSDOM'da renk kontrastı ve responsive düzeni değerlendiremez; gerçek Chromium renk kontrastı taraması şu anda giriş ekranını kapsar. Ekran okuyucu ve manuel erişilebilirlik denetimi bu otomasyonun kapsamı dışındadır.

## Ürün fikri: çevrimiçi alışveriş sitesi

Öğrenme projesi olarak müşterilerin hesaplarıyla giriş yapabildiği, ürünleri inceleyebildiği ve alışveriş yapabildiği bir **çevrimiçi mağaza** geliştirilecektir. Kimlik sağlayıcı Keycloak'tır. İlk kullanıcı yönetimi dilimi alıcıların kendi hesaplarını oluşturarak OIDC ile giriş yapmasıdır.

### İlk sürüm kapsamı

- Keycloak üzerinden alıcı self-registration ve OIDC tabanlı güvenli giriş.
- Kimliği doğrulanmış müşteriye ana sayfa içeriğinin sunulması.
- Alıcının satıcı başvurusu oluşturması, admin'in manuel incelemesi ve onay sonrası satıcı rolü provisioning.
- Satıcının ortak ürün kataloğunda yalnızca kendi ürünlerini yönetmesi.
- İlerleyen dilimlerde ürün kataloğu, arama, sepet, sipariş ve müşteri hesabı akışları.
- API'de Keycloak imzası, issuer, audience, süre ve rollerin doğrulanması.

E-posta doğrulama ve parola sıfırlama daha sonraki dilimlere bırakılmıştır. Alıcı kayıt diliminden sonra REQ-007 kapsamında bireysel, şahıs işletmesi ve şirket başvuruları; belge toplamayan, admin tarafından manuel incelenen ilk akış olarak planlanmıştır. Bu inceleme formal KYC veya satışa yasal uygunluk teyidi değildir; onaylı satıcıların uygulama içi marketplace yetkileri REQ-016'da netleştirilecektir. Gerçek ödeme/PSP, kargo/taşıyıcı ve KYC/KYB entegrasyonları kapsam dışıdır; ilgili akışlar yerel/mock davranışlarla sınanır. Admin rolü şimdilik yalnızca Keycloak yönetim konsolundan güvenilir operatör tarafından verilebilir. Gerçek zamanlı işbirliği, mikroservisler ve mobil uygulama da kapsam dışındadır.

## Örnek kullanım senaryosu: Alıcı kaydı ve giriş

**Kullanıcı:** Yeni veya kayıtlı alıcı

**Amaç:** Keycloak üzerinde alıcı hesabı oluşturup mağaza ana sayfasına erişmek.

1. Ziyaretçi **Alıcı hesabı oluştur** seçer; kimlik bilgileri Keycloak'ın barındırılan ekranında girilir.
2. Kayıtla oluşan hesap varsayılan `buyer` rolünü alır. Kayıt ekranı `seller` veya `admin` rolü atayamaz.
3. Authorization Code + PKCE akışıyla tarayıcı uygulamasına dönüş yapılır; parolalar mağaza API'sine gönderilmez.
4. React access token ile `/api/v1/auth/me` ve korumalı mağaza API'lerini çağırır; FastAPI token'ı Keycloak JWKS, issuer ve audience ile doğrular.
5. Token yok/geçersizse `401`, alıcı admin işlemi denediğinde `403` döner.

Tam kabul kriterleri [REQ-001](./docs/requirements.md#req-001-kayıtlı-müşteri-girişi-ve-ana-sayfaya-erişim) ve [REQ-006](./docs/requirements.md#req-006-keycloak-ile-alıcı-kaydı-ve-rol-tabanlı-kullanıcı-yönetimi) içinde tanımlanmıştır.

## Backend'i çalıştırma

FastAPI yerel geliştirmede Docker Compose ile çalışan PostgreSQL'i kullanır. SQLite, hızlı ve izole unit/API testleri ile Playwright E2E veritabanı için kullanılır. Docker Desktop/Compose kurulu olmalıdır.

```powershell
Set-Location .
$env:KEYCLOAK_ADMIN_PASSWORD = Read-Host "Yerel Keycloak yönetici parolası"
docker compose up -d postgres keycloak
docker compose ps

Set-Location apps/api
uv sync
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
uv run alembic upgrade head
uv run uvicorn shop_api.main:create_app --factory --reload
```

Compose PostgreSQL'i yalnızca yerel makineye (`127.0.0.1:5432`) açar ve kalıcılık için `postgres_data` volume'ünü kullanır. Varsayılan `shop-local-dev-only` parolası yalnızca yerel geliştirme içindir; paylaşılmış/uzak ortamlarda kullanmayın. İsterseniz Compose öncesinde `POSTGRES_DB`, `POSTGRES_USER` ve `POSTGRES_PASSWORD` ortam değişkenlerini tanımlayın ve aynı değerlerle `apps/api/.env` içindeki `SHOP_DATABASE_URL`'i güncelleyin. PostgreSQL verileri `docker compose down` ile silinmez; `docker compose down -v` veritabanı volume'ünü de kalıcı olarak siler.

İlk kurulumdan sonra şema migration'ları PostgreSQL'e uygulanır. Hızlı API regresyon testleri ve Playwright E2E testleri SQLite üzerinde izole çalışır; gerçek PostgreSQL sepet/migration entegrasyon testleri ise ayrı `shop_test` veritabanında çalıştırılır:

```powershell
docker compose exec -T postgres createdb -U shop shop_test
Set-Location apps/api
$env:SHOP_TEST_DATABASE_URL = "postgresql+psycopg://shop:shop-local-dev-only@127.0.0.1:5432/shop_test"
uv run pytest -m postgres tests/test_cart_postgres.py
```

Bu test veritabanının adı `_test` ile bitmelidir; test fixture'ı bunu zorunlu tutar ve yalnızca bu veritabanındaki uygulama tablolarını temizler. Ayrıntılar [backend README](./apps/api/README.md#tests-and-lint) içindedir.

Realm ve `shop-web` public OIDC istemcisi `infra/keycloak/realm-export.json` dosyasından ilk Keycloak başlangıcında içe aktarılır. Keycloak hazır olduğunda alıcı kayıt ve giriş ekranı `http://localhost:8080` üzerinden sunulur. `SHOP_OIDC_ISSUER` ve audience varsayılanları yerel realm ile eşleşir.

Keycloak `liva` login theme'i `infra/keycloak/themes/liva` dizininden salt okunur bağlanır; yinelenen hesap hataları e-posta varlığını açıklamayan genel mesaj gösterir. Keycloak realm'i kalıcı Docker volume'ünde tutulur; sonraki başlangıçlarda realm import'u mevcut realm ayarlarını güncellemez. Önceden başlatılmış realm için Admin Console → Realm settings → Themes ekranından Login theme olarak `liva` seçip kaydedin; admin olay kaydını da açık ve olay detaylarını kapalı yapılandırın. Volume'ü silmek test kullanıcılarını ve realm verisini de siler.

Satıcı onayında API'nin Keycloak service account üzerinden `seller` realm rolünü atayabilmesi gerekir. Yeni realm import'u `shop-api-admin` istemcisini ekler; kalıcı/önceden oluşturulmuş realm için istemci, secret, service-account rolleri ve açık client-scope eşlemeleri [API kurulum notlarında](./apps/api/README.md#seller-role-provisioning) açıklanmıştır. Service-account secret'ını yalnızca `apps/api/.env` içinde tutun.

```powershell
Set-Location apps/web
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

`http://localhost:5173` adresinde **Giriş yap** veya **Alıcı hesabı oluştur** seçilebilir. Uygulama parolayı almaz; Keycloak oturumundan dönen token'ı API'ye gönderir. Keycloak admin konsolu `http://localhost:8080/admin` adresindedir. İlk admin ve sonraki admin rol atama/geri alma işlemleri yalnızca güvenilir operatör tarafından bu konsoldan yapılır; uygulama içinde admin yönetim ekranı/API'si yoktur. Admin rolünü kaldırmadan veya hesabı kapatmadan önce başka etkin admin bulunduğunu doğrulayın; Keycloak bunu otomatik engellemez, break-glass operatör erişimini koruyun. API dokümantasyonu `http://127.0.0.1:8000/docs` adresindedir. Ayrıntılar [backend README](./apps/api/README.md) ve [web README](./apps/web/README.md) içindedir.

### Playwright E2E testleri

Her PR'da `smoke` Playwright grubu Chromium, gerçek API ve geçici SQLite kullanır; ephemeral test OIDC anahtarı/JWKS sağlayıcısı sayesinde Keycloak veya parola gerektirmez:

```powershell
Set-Location apps/web
npm run test:e2e:smoke
```

Yeni E2E senaryolarında API ile test verisi hazırlama, ortak Playwright fixture'ları, gerektiğinde ince POM ve iş senaryosu odaklı spec yaklaşımı izlenir; ayrıntılar [web E2E standardında](./apps/web/README.md#test-layers) ve roadmap'deki QA-024'te yer alır.

Gerçek Keycloak kapsamlı senaryoları CI'da her gece 02:00 UTC'de ve `workflow_dispatch` ile ephemeral realm üzerinde çalışır. Yerelde çalıştırmak için Keycloak realm'ini başlatıp bootstrap admin parolasını test sürecine verin. Değeri kaynak koda veya bu belgeye yazmayın:

```powershell
Set-Location apps/web
$env:E2E_KEYCLOAK_E2E = "1"
$env:E2E_KEYCLOAK_ADMIN_PASSWORD = Read-Host -Prompt "Local Keycloak bootstrap password"
npm run test:e2e:keycloak
```

Vitest smoke testi `npm run test:smoke`, tüm frontend regresyon testleri `npm test` veya `npm run test:coverage`; backend smoke `uv run pytest -m smoke`, tüm SQLite regresyonları `uv run pytest`, PostgreSQL entegrasyonları `uv run pytest -m postgres tests/test_cart_postgres.py` ile seçilir. Yeni testler için marker/tag ve çalışma politikası [gereksinim dokümanında](./docs/requirements.md#qa-020-test-sınıflandırması-ve-çalışma-sıklığı) açıklanmıştır.

Frontend coverage, tüm projeyi değil kritik uygulama, API/auth ve `*Panel.tsx` dosyalarını ölçer; eşikler ve kapsam dışı dosyalar [web test katmanları](./apps/web/README.md#test-layers) bölümündedir. Coverage, davranış doğrulamasının veya E2E testlerinin yerine geçmez.

Deterministik QA-019 senaryosu buyer ürün görüntüleme, sepet, adres, checkout ve mock ödeme akışını doğrular; buyer'ın ürün oluşturma girişimi reddedilir. Keycloak E2E'leri kayıt/giriş ve realm rol yönetimi testlerini içerir; admin CRUD/satıcı başvurusu geçici test hesapları kullanır. Satıcı akışı için API service-account secret'ı ve yerel realm rol eşlemeleri gerekir. Her iki kip de E2E'ye özel geçici SQLite veritabanını kullanır.

## Önerilen teknoloji seti

Teknolojiler öğrenme hedefini desteklemek için seçilmiştir; her aracın tüm özelliklerini öğrenmek gerekmez.

| Alan | Teknoloji | Bu projedeki kullanım |
|---|---|---|
| Backend dili | Python | API ve iş kurallarının geliştirilmesi |
| Backend/API | FastAPI, Uvicorn | Tipli REST API, dependency injection ve ASGI sunucusu |
| Veri doğrulama | Pydantic | API istek/yanıt şemaları ve veri doğrulama |
| Backend testleri | pytest, HTTPX/FastAPI TestClient | Unit, API ve entegrasyon testleri |
| Python kalite araçları | Ruff, mypy (isteğe bağlı) | Lint/format ve statik tip kontrolü |
| İstemci dili | TypeScript | İstemcide tip güvenli geliştirme |
| İstemci | React, Vite | Ekranlar, formlar ve kullanıcı etkileşimleri |
| İstemci testi | Vitest, React Testing Library, jest-dom | Unit ve component testleri |
| API dokümantasyonu | FastAPI OpenAPI/Swagger UI | İstek/yanıt sözleşmelerini görünür kılma |
| Veritabanı | PostgreSQL (yerel geliştirme ve uygulama), SQLite (izole testler) | Kalıcı ilişkisel veri |
| ORM/migrasyon | SQLAlchemy 2, Alembic | Veri erişimi, modelleme ve şema migrasyonları |
| Test otomasyonu | Playwright | Tarayıcı tabanlı uçtan uca ve sistem senaryoları |
| Python bağımlılıkları | uv, `pyproject.toml` | Sanal ortam ve kilitli bağımlılık yönetimi |
| Test verisi/ortamı | Docker, Docker Compose | Yerel veritabanı ve tekrarlanabilir ortam |
| CI | GitHub Actions | Python/TypeScript kalite kontrolleri, testler ve build |
| Ek kalite kontrolleri | axe-core, k6 (ileri aşama) | Erişilebilirlik ve temel performans kontrolleri |

**Sürüm ilkesi:** Desteklenen güncel Python sürümünü ve Node.js LTS'yi kullanın; Python ve JavaScript bağımlılıklarını lock dosyalarıyla sabitleyin. Yeni ana sürümlere geçişi ayrı ve bilinçli bir değişiklik olarak ele alın.

## Test stratejisi

Test türleri birbirinin yerine geçmez. Hızlı ve dar kapsamlı kontrollerden başlayıp, daha gerçekçi fakat daha yavaş kontrollere doğru ilerleyin.

1. **Static checks:** Python lint/format (Ruff), istemci TypeScript tip kontrolü ve lint. Kod çalıştırmadan hataları erken yakalar.
2. **Unit test:** Tek bir fonksiyon veya sınıfı izole test edin. Örnek: senaryo durum geçişi veya doğrulama kuralları.
3. **Component test:** React bileşenini kullanıcı davranışları üzerinden test edin; uygulama ayrıntılarına aşırı bağlanmayın.
4. **Integration test:** FastAPI dependency'leri, servisler ve veri erişim katmanının birlikte çalışmasını doğrulayın. Gerekli yerde izole gerçek test veritabanı kullanın.
5. **API test:** HTTP metodu, durum kodu, şema, doğrulama, yetkilendirme ve hata yanıtlarını kontrol edin.
6. **Contract test:** İstemci ile API arasındaki OpenAPI sözleşmesini doğrulayın. Ayrı bir consumer/provider aracı ancak bağımsız dağıtım ihtiyacı doğarsa ekleyin.
7. **System/E2E test:** Uygulamayı gerçekçi bir ortamda başlatıp kritik iş akışlarını tarayıcı üzerinden uçtan uca doğrulayın.
8. **Non-functional test:** Temel erişilebilirlik, güvenlik kontrolleri ve performans ölçümlerini hedefli olarak ekleyin.

Her test için şu soruları sorun: Hangi riski azaltıyor? Hangi seviyede en az maliyetle doğrulanır? Bağımlılıkları gerçek mi, test double mı? Başarısız olduğunda tanı koymak kolay mı?

## Önerilen depo yapısı

```text
online-store/
  apps/
    web/                 # React istemcisi
    api/                 # FastAPI REST API (pyproject.toml, Alembic)
  packages/
    shared/              # Gerekirse istemciye ait paylaşılan araçlar
  e2e/                   # Playwright sistem ve uçtan uca testleri
  docs/                  # Ürün gereksinimleri, test planı ve karar kayıtları
  docker-compose.yml
  README.md
  ROADMAP.md
```

Bu yapı başlangıç önerisidir; ilk aşamada monorepo aracı eklemek zorunlu değildir. Python backend'i kendi `pyproject.toml` dosyasıyla yönetebilir; Nx/Turborepo gibi araçları erkenden eklemeyin.

## Kalite kapıları

Her pull request için hedeflenen temel sıra:

1. Python lint/format ve istemci lint/tip kontrolü.
2. pytest unit testleri ve Vitest component testleri.
3. FastAPI API/entegrasyon testleri (izole test veritabanı ile).
4. İstemci build'i.
5. Kararlı ve kritik Playwright senaryoları.

Testlerin deterministik, bağımsız ve anlaşılır hata mesajlarına sahip olmasını hedefleyin. Test başarısızlıklarını gizlemeyin; flaky testleri karantinaya almak yerine kök nedenini takip edin. Kapsam yüzdesini tek başına kalite ölçütü olarak kullanmayın; kritik kuralların ve risklerin gerçekten kapsandığını değerlendirin.

### CI sonuçlarını tek ekranda izleme

GitHub Actions iş akışı her push ve pull request'te backend, frontend ve tarayıcı E2E aşamalarını ayrı işler olarak çalıştırır. İş akışı sayfasındaki **Summary** sekmesi bu aşamaların durumunu, testlerde geçen/toplam senaryo sayısını ve kapsam yüzdelerini tek tabloda birleştirir. Coverage yüzdeleri kendi ölçüm kapsamları içinde gösterilir; farklı kod tabanlarının yüzdeleri tek bir yanıltıcı sayıya dönüştürülmez.

Bir iş akışı koşusu içinden **Unified test report** işinin özetine ulaşın. Frontend için gerçekten ölçülen dosyalar coverage raporundan okunarak listelenir; dosya kapsamı veya zorunlu rapor yoksa kalite kapısı başarısız olur. Ayrıntılı HTML coverage raporları, JUnit test sonuçları ve başarısız E2E koşularının Playwright izleri koşu artefaktları olarak 14 gün saklanır. CI yerelde çalışan geliştirme sunucularını veya veritabanını kullanmaz.

## Yol planı

Uygulanabilir aşamalar, çıktılar ve tamamlanma ölçütleri için [ROADMAP.md](./ROADMAP.md) dosyasına bakın.
