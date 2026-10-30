# Full-stack Alışveriş Uygulaması — QA Öğrenme Projesi

Bu proje, çevrimiçi alışveriş uygulamasını Agile yaklaşımla gereksinimlerden başlayarak geliştirirken yazılım testinin her seviyesini uygulamalı öğrenmek için hazırlanmıştır. Amaç yalnızca çalışan bir uygulama çıkarmak değil; testleri doğru seviyede tasarlamak, otomatikleştirmek, sonuçlarını yorumlamak ve kalite kararlarını kanıta dayandırmaktır. Ürün gereksinimleri [docs/requirements.md](./docs/requirements.md) dosyasında tutulur.

## Öğrenme hedefleri

- Bir ürün fikrini test edilebilir gereksinimlere ve kabul kriterlerine dönüştürmek.
- Modern web uygulamasının istemci, API ve veritabanı katmanlarını kurup birbirine bağlamak.
- Unit test'ten entegrasyon, API, sistem ve uçtan uca testlere kadar farklı test seviyelerini uygulamak.
- Risk temelli test tasarımı, test verisi yönetimi, hata raporlama ve regresyon yaklaşımını pratik etmek.
- Testleri CI hattında çalıştırmak; rapor, log ve kalite kapılarını değerlendirmek.
- Teknik ayrıntıları projenin ihtiyacı kadar öğrenmek; gereksiz altyapı karmaşıklığından kaçınmak.

## Ürün fikri: çevrimiçi alışveriş sitesi

Öğrenme projesi olarak müşterilerin hesaplarıyla giriş yapabildiği, ürünleri inceleyebildiği ve alışveriş yapabildiği bir **çevrimiçi mağaza** geliştirilecektir. Kimlik sağlayıcı Keycloak'tır. İlk kullanıcı yönetimi dilimi alıcıların kendi hesaplarını oluşturarak OIDC ile giriş yapmasıdır.

### İlk sürüm kapsamı

- Keycloak üzerinden alıcı self-registration ve OIDC tabanlı güvenli giriş.
- Kimliği doğrulanmış müşteriye ana sayfa içeriğinin sunulması.
- İlerleyen dilimlerde ürün kataloğu, arama, sepet, sipariş ve müşteri hesabı akışları.
- API'de Keycloak imzası, issuer, audience, süre ve rollerin doğrulanması.

E-posta doğrulama ve parola sıfırlama daha sonraki dilimlere bırakılmıştır. Satıcı başvurusu/işletme doğrulaması ve admin ataması alıcı kayıt diliminin dışındadır; admin rolü şimdilik yalnızca Keycloak yönetim konsolundan güvenilir operatör tarafından verilebilir. Gerçek zamanlı işbirliği, mikroservisler ve mobil uygulama da kapsam dışındadır.

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

FastAPI yerel geliştirmede SQLite kullanır. Keycloak, yerel Docker Compose servisi olarak başlatılır. Docker Desktop/Compose kurulu olmalıdır.

```powershell
Set-Location .
$env:KEYCLOAK_ADMIN_PASSWORD = Read-Host "Yerel Keycloak yönetici parolası"
docker compose up -d keycloak

Set-Location apps/api
uv sync
Copy-Item .env.example .env
uv run alembic upgrade head
uv run uvicorn shop_api.main:create_app --factory --reload
```

Realm ve `shop-web` public OIDC istemcisi `infra/keycloak/realm-export.json` dosyasından ilk Keycloak başlangıcında içe aktarılır. Keycloak hazır olduğunda alıcı kayıt ve giriş ekranı `http://localhost:8080` üzerinden sunulur. `SHOP_OIDC_ISSUER` ve audience varsayılanları yerel realm ile eşleşir.

Keycloak `liva` login theme'i `infra/keycloak/themes/liva` dizininden salt okunur bağlanır; yinelenen hesap hataları e-posta varlığını açıklamayan genel mesaj gösterir. Keycloak realm'i kalıcı Docker volume'ünde tutulur; sonraki başlangıçlarda realm import'u mevcut realm ayarlarını güncellemez. Önceden başlatılmış realm için Admin Console → Realm settings → Themes ekranından Login theme olarak `liva` seçip kaydedin. Volume'ü silmek test kullanıcılarını ve realm verisini de siler.

```powershell
Set-Location apps/web
npm ci
Copy-Item .env.example .env
npm run dev
```

`http://localhost:5173` adresinde **Giriş yap** veya **Alıcı hesabı oluştur** seçilebilir. Uygulama parolayı almaz; Keycloak oturumundan dönen token'ı API'ye gönderir. Keycloak admin konsolu `http://localhost:8080/admin` adresindedir. Admin ürün işlemlerini yerel olarak denemek için bir test kullanıcısına `admin` realm rolünü yalnızca bu güvenilir konsoldan atayın; alıcılar kendileri rol yükseltemez. API dokümantasyonu `http://127.0.0.1:8000/docs` adresindedir. Ayrıntılar [backend README](./apps/api/README.md) ve [web README](./apps/web/README.md) içindedir.

### Keycloak hesabı oluşturma E2E testi

Keycloak realm'ini başlatıp aşağıdaki komutla tarayıcı testini çalıştırın:

```powershell
$env:E2E_KEYCLOAK_E2E = "1"
Set-Location apps/web
npm run test:e2e
```

Playwright testi benzersiz alıcı hesabını gerçek Keycloak kayıt ekranından oluşturur; parolalar test sırasında üretilir. Keycloak E2E testi varsayılan olarak atlanır; gerçek realm çalışırken açıkça etkinleştirilmelidir.

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
| Veritabanı | SQLite (ilk yerel dilim), PostgreSQL (sonraki ortam) | Kalıcı ilişkisel veri |
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

Bir iş akışı koşusu içinden **Unified test report** işinin özetine ulaşın. Ayrıntılı HTML coverage raporları, JUnit test sonuçları ve başarısız E2E koşularının Playwright izleri koşu artefaktları olarak 14 gün saklanır. CI yerelde çalışan geliştirme sunucularını veya veritabanını kullanmaz.

## Yol planı

Uygulanabilir aşamalar, çıktılar ve tamamlanma ölçütleri için [ROADMAP.md](./ROADMAP.md) dosyasına bakın.
