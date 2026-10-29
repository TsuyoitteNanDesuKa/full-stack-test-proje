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

Öğrenme projesi olarak müşterilerin hesaplarıyla giriş yapabildiği, ürünleri inceleyebildiği ve alışveriş yapabildiği bir **çevrimiçi mağaza** geliştirilecektir. İlk geliştirme dilimi, kayıtlı bir müşterinin giriş yapması ve korumalı ana sayfa API'sine erişmesidir.

### İlk sürüm kapsamı

- Müşteri hesabıyla güvenli giriş ve kimlik doğrulaması.
- Kimliği doğrulanmış müşteriye ana sayfa içeriğinin sunulması.
- İlerleyen dilimlerde ürün kataloğu, arama, sepet, sipariş ve müşteri hesabı akışları.
- Güvenli parola saklama, geçersiz kimlik bilgileri ve yetkisiz erişim davranışlarının test edilmesi.

İlk dilimde müşteri kaydı API'si, ürün kataloğu, sepet ve sipariş akışları kapsam dışıdır. Gerçek zamanlı işbirliği, mikroservisler ve mobil uygulama da kapsam dışındadır. Yeni özellikler gereksinimleri ve testleriyle birlikte aşamalı eklenmelidir.

## Örnek kullanım senaryosu: Müşteri girişi

**Kullanıcı:** Kayıtlı bir müşteri  
**Amaç:** Hesabına güvenli biçimde giriş yapıp mağaza ana sayfasına erişmek.

1. Müşteri kayıtlı e-posta adresini ve parolasını göndererek giriş yapar.
2. Doğru kimlik bilgileriyle geçici bir erişim belirteci alır.
3. Belirteci kullanarak ana sayfa API'sine istek gönderir ve mağazanın karşılama içeriğini görür.
4. Yanlış kimlik bilgileri veya belirteç olmadan ana sayfa isteği gönderildiğinde erişim reddedilir.

Tam kabul kriterleri ve API sözleşmesi [REQ-001](./docs/requirements.md#req-001-kayitli-müşteri-girişi-ve-ana-sayfaya-erişim) gereksiniminde tanımlanmıştır.

## Backend'i çalıştırma

İlk backend dilimi `apps/api` altında FastAPI ile geliştirilmiştir. Docker/PostgreSQL kurulumu tamamlanana kadar yerel geliştirmede SQLite kullanılır.

```powershell
Set-Location apps/api
uv sync
Copy-Item .env.example .env
```

`.env` içindeki `SHOP_SECRET_KEY` değerini en az 32 karakterlik rastgele bir değerle değiştirin. Ardından veritabanı şemasını kurup API'yi başlatın:

```powershell
uv run alembic upgrade head
uv run shop-create-user
uv run uvicorn shop_api.main:create_app --factory --reload
```

`shop-create-user` komutu giriş yapabilmek için yerel bir mevcut hesap oluşturur; herkese açık kayıt uç noktası değildir. API dokümantasyonu `http://127.0.0.1:8000/docs` adresinde açılır. Diğer ortam ve test yönergeleri [backend README](./apps/api/README.md) dosyasındadır.

### Login arayüzünü çalıştırma

İlk kurulumda API ortamını hazırlayıp örnek bir müşteri hesabı oluşturun. Parola terminalde gizli istenir:

```powershell
Set-Location apps/api
uv sync
Copy-Item .env.example .env
```

`.env` içindeki `SHOP_SECRET_KEY` değerini benzersiz ve en az 32 karakterlik bir değerle değiştirin. Ardından:

```powershell
uv run alembic upgrade head
uv run shop-create-user
```

İki terminal açın. İlkinde backend'i:

```powershell
Set-Location apps/api
uv run uvicorn shop_api.main:create_app --factory --reload
```

İkincisinde frontend'i başlatın:

```powershell
Set-Location apps/web
npm install
npm run dev
```

Login ekranını `http://127.0.0.1:5173` adresinde açın. Frontend `/api` isteklerini Vite proxy ile `http://127.0.0.1:8000` adresindeki backend'e iletir. Giriş başarılı olduğunda frontend, bearer belirteciyle ana sayfa API'sini çağırır; belirteç tarayıcı belleğinde tutulur ve çıkışta silinir.

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
