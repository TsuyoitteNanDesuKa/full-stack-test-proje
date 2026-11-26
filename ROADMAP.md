# Yol Planı: Full-stack Alışveriş Uygulaması ve QA Öğrenme Projesi

Bu plan, test pratiğini merkeze alır. Her aşamada önce test edilebilir gereksinim ve riskler belirlenir, sonra uygulama/test geliştirilir. Bir sonraki aşamaya geçmeden önce o aşamanın çıkış ölçütlerini karşılayın.

## Aşama 0 — Proje ve test yaklaşımını tanımlama

**Öğren:** Ürün kapsamı, kullanıcı hikâyesi, kabul kriteri, risk temelli test, test seviyesi ve exit criteria.

**Yapılacaklar**

- Alışveriş uygulamasının ilk sürüm kapsamını ve kapsam dışını netleştir.
- [docs/requirements.md](./docs/requirements.md) içinde müşteri girişi ve ana sayfa için ilk gereksinimi, kabul kriterlerini ve test fikirlerini tanımla.
- İlerleyen dilimler için ürün keşfi, sepet ve sipariş akışlarını test edilebilir gereksinimlere ayır.
- Her akış için olumlu, olumsuz ve sınır durumlarını içeren kabul kriterleri yaz.
- Riskleri olasılık/etki ile önceliklendir; kritik iş kurallarını işaretle.
- Test stratejisi, hata raporu şablonu ve Definition of Done belirle.

**Çıktılar:** Ürün kapsamı, örnek kullanım senaryosu, kullanıcı hikâyeleri/kabul kriterleri, risk listesi, test stratejisi.

**Tamamlanma ölçütü:** Her ilk sürüm hikâyesi gözlemlenebilir kabul kriterlerine ve en az bir test fikrine bağlıdır.

## Aşama 1 — Geliştirme ortamı ve kalite temeli

**Öğren:** Git dalları/PR, Python, sanal ortam ve bağımlılık yönetimi (`uv`, `pyproject.toml`), Node.js LTS/npm, TypeScript temelleri, lint/format, environment configuration.

**Yapılacaklar**

- FastAPI backend ve React istemci iskeletini oluştur; istemcide TypeScript'i etkinleştir.
- Python backend için pytest ve Ruff; istemci için lint, format ve tip kontrolünü yapılandır.
- Gizli değerleri kaynak koduna koymadan `.env.example` yaklaşımını belirle.
- İlk CI iş akışında Python/istemci kalite kontrollerini ve build'i çalıştır.

**Çıktılar:** Çalışan boş uygulama iskeleti, katkı akışı, CI kalite kapısı.

**Tamamlanma ölçütü:** Temiz checkout'tan bağımlılıklar kurulabilir; yerel kalite kontrolleri ve CI başarılıdır.

## Aşama 2 — Gereksinimlerden test tasarımına

**Öğren:** Eşdeğer bölümlendirme, sınır değer analizi, karar tablosu, durum geçişi, keşif testi ve izlenebilirlik.

**Yapılacaklar**

- Müşteri giriş formu, kimlik doğrulama ve ana sayfa erişimi için test koşulları tasarla.
- E-posta/parola doğrulaması, belirteç süresi ve yetkisiz istekler için sınırları belirle.
- Kabul kriterlerini test koşullarına bağlayan basit bir izlenebilirlik tablosu tut.
- Riskli alanlarda test verisi ve beklenen sonuçları önceden tanımla.

**Çıktılar:** Test koşulları, test verisi taslağı, gereksinim-test izlenebilirliği.

**Tamamlanma ölçütü:** Her kritik kabul kriteri için pozitif ve negatif doğrulama vardır; testler tekrarlanabilir veri kullanır.

## Aşama 3 — Veri modeli ve veritabanı

**Öğren:** İlişkisel modelleme, PostgreSQL, SQL temelleri, SQLAlchemy 2 modelleri ve session yönetimi, Alembic migrasyonları, transaction kavramı.

**Yapılacaklar**

- User, Product, Cart, Order ve ilgili kalemler için ilişkileri modelle.
- Gerekli alan kısıtları ve ilişkileri veritabanı seviyesinde de tanımla.
- Docker Compose ile yerel PostgreSQL'i çalıştır; migrasyonları uygula.
- Modelleme/doğrulama kurallarına pytest unit testleri; migrasyon ve sorgu davranışlarına veritabanı entegrasyon testi ekle.

**Çıktılar:** Veri modeli, migrasyonlar, tekrarlanabilir test verisi oluşturma/temizleme yaklaşımı.

**Tamamlanma ölçütü:** Yeni veritabanı boş ortamdan migrasyonlarla kurulabilir; testler yerel kalıcı veriye bağımlı değildir.

## Aşama 4 — Backend ve API

**Öğren:** FastAPI router ve dependency injection, REST, HTTP durum kodları, Pydantic şemaları/doğrulama, hata modeli, OpenAPI, async/sync endpoint seçimi.

**Yapılacaklar**

- Önce çekirdek iş kurallarını pytest ile küçük unit testlerde tanımla.
- İlk gereksinim için kimlik doğrulama ve ana sayfa uçlarını geliştir; sonraki dilimlerde katalog, sepet ve sipariş uçlarını ekle.
- Pydantic ile istek/yanıt doğrulaması, tutarlı hata yanıtları, sayfalama ve temel yetkilendirme ekle.
- FastAPI'nin OpenAPI/Swagger UI çıktısını doğrula; API testlerini başarılı, doğrulama hatalı ve yetkisiz isteklerle genişlet.
- HTTPX/FastAPI TestClient kullanarak API davranışını; dependency override ve izole test DB'siyle entegrasyon davranışını doğrula.

**Çıktılar:** İlk FastAPI uçları, OpenAPI tanımı, pytest unit ve API entegrasyon testleri.

**Tamamlanma ölçütü:** API kabul kriterlerini karşılar; hatalı girdiler kontrollü yanıtlanır; entegrasyon testleri birbirinden bağımsızdır.

## Aşama 5 — Frontend ve component testleri

**Öğren:** React bileşenleri, form yönetimi, erişilebilir HTML, FastAPI ile konuşan API istemcisi, kullanıcı merkezli component testleri.

**Yapılacaklar**

- Ana sayfa, ürün kataloğu ve müşteri etkileşim ekranlarını gereksinim sırasına göre geliştir.
- Yükleniyor, boş, başarılı ve hata durumlarını görünür hale getir.
- Kritik etkileşimleri React Testing Library ile kullanıcı davranışı üzerinden test et.
- Klavye ile kullanım ve temel erişilebilirlik kontrollerini ekle.

**Çıktılar:** Kullanılabilir istemci ekranları, component testleri, erişilebilirlik kontrol listesi.

**Tamamlanma ölçütü:** Form doğrulaması, hata gösterimi ve temel klavye etkileşimleri otomatik testlerle doğrulanır.

## Aşama 6 — Test koşuları ve tam dikey özellik

**Öğren:** Dikey dilim, uçtan uca iş akışı, istemci/API entegrasyonu, test verisi yaşam döngüsü.

**Yapılacaklar**

- Ürün seçme, sepete ekleme ve siparişi tamamlama akışını API ve UI boyunca tamamla.
- Müşteriye sepet ve sipariş durumunu göster.
- İş kuralı, API ve UI seviyelerinde uygun testleri ekle; her şeyi yalnızca E2E ile doğrulama.
- Tekrarlanabilir seed/factory yaklaşımı belirle; testlerin sırası sonucu etkilemesin.

**Çıktılar:** İlk kullanılabilir ürün akışı, katmanlara dağıtılmış regresyon testleri.

**Tamamlanma ölçütü:** Müşteri ürünleri seçip sipariş akışını tamamlayabilir; kritik iş kuralları uygun seviyelerde doğrulanır.

## Aşama 7 — Sistem ve uçtan uca testler

**Öğren:** Playwright, sistem testi, E2E kapsamı, test ortamı, izolasyon, bekleme stratejileri ve flaky test yönetimi.

**Yapılacaklar**

- Uygulamayı test ortamında başlatan E2E yapılandırması kur.
- Kritik kullanıcı yolculuğunu tarayıcı üzerinden test et: giriş, ürün seçme, sepete ekleme ve siparişi tamamlama.
- Hatalı giriş ve yetkisiz erişim gibi yüksek riskli akışlardan birkaçını ekle.
- Test başarısızlığında ekran görüntüsü/trace gibi tanı artefaktlarını CI'da sakla.
- UI metni veya iç implementasyona aşırı bağlanan seçicilerden kaçın; erişilebilir rolleri tercih et.

**Çıktılar:** Sistem/E2E paketi, test ortamı, CI tanı artefaktları.

**Tamamlanma ölçütü:** Kritik iş akışları temiz ortamda tutarlı biçimde çalışır; hata olduğunda kök neden araştırılabilir.

## Aşama 8 — Sözleşme, güvenlik ve erişilebilirlik

**Öğren:** API sözleşme doğrulaması, OWASP Top 10 farkındalığı, güvenli kimlik doğrulama ilkeleri, erişilebilirlik testleri.

**Yapılacaklar**

- API yanıtlarını OpenAPI sözleşmesi ve istemci beklentileriyle karşılaştır.
- Kimlik doğrulama, yetkilendirme, girdi doğrulama ve hassas verilerin yanıtlarda/loglarda görünmemesini test et.
- Kritik ekranlarda otomatik erişilebilirlik taraması yap; bulguları manuel klavye kontrolüyle tamamla.
- Güvenlik kontrollerini test ortamında ve güvenli kapsamda yürüt; gerçek kullanıcı verisi kullanma.

**Çıktılar:** Sözleşme kontrolleri, güvenlik test koşulları, erişilebilirlik bulgu listesi.

**Tamamlanma ölçütü:** Kritik riskler için otomatik ve manuel doğrulamalar vardır; bulunan sorunlar önceliklendirilip izlenir.

## Aşama 9 — CI, regresyon ve raporlama

**Öğren:** GitHub Actions, test katmanlarının pipeline sırası, artefaktlar, test raporlama ve kalite kapıları.

**Yapılacaklar**

- Pull request'te static checks, unit/component, API entegrasyon ve build adımlarını çalıştır.
- Daha yavaş Playwright sistem testlerini uygun aşamada çalıştır; rapor ve trace'i sakla.
- Başarısız testi otomatik yeniden deneyerek gizlemek yerine deterministikliği iyileştir.
- Test sonuçlarını gereksinim ve risklerle ilişkilendir; kapsam yüzdesini bağlamıyla yorumla.

**Çıktılar:** Güvenilir CI hattı, regresyon paketi, okunabilir test raporu.

**Tamamlanma ölçütü:** PR kalite kapıları görünür ve tekrarlanabilirdir; başarısızlıklar merge kararını güvenilir biçimde engeller.

## Aşama 10 — Performans ve sürümleme

**Öğren:** Temel performans senaryosu, yük profili, ölçüm metrikleri, sürüm notları ve dağıtım sonrası smoke testi.

**Yapılacaklar**

- Önce hedef metrik ve gerçekçi kullanım profili tanımla; sonra k6 ile sınırlı performans senaryosu oluştur.
- API yanıt süresi ve hata oranı gibi metrikleri ölç; sonucu bir başlangıç çizgisiyle karşılaştır.
- Dağıtım ortamı seçimini (ör. mevcut bir PaaS) ihtiyaç doğduğunda yap; sırf teknoloji öğrenmek için üretim altyapısını büyütme.
- Sürüm öncesi regresyon, smoke test ve bilinen riskleri içeren kısa bir release checklist hazırla.

**Çıktılar:** Performans test taslağı, metrikler, sürüm kontrol listesi.

**Tamamlanma ölçütü:** Test hedefleri ve sonuçları ölçülebilir; bilinen sınırlamalar ve sürüm riskleri açıkça raporlanır.

## v1.0 çıkış kapısı ve incremental ürün yol haritası

Özellikler küçük, bağımsız dikey dilimler halinde gereksinim → API/veri modeli → UI → katmanlı test → sürümleme sırasıyla eklenir. Her özellik maddesinde geliştirme kapsamının hemen arkasında o özelliğe ait test geliştirme planı bulunur. Testler özellikten sonraya bırakılan genel bir iş değil, aynı dilimin zorunlu devamıdır; bir sonraki dilime ancak bütün ilgili kalite kapıları geçtikten sonra başlanır.

### Öncelik 0 — v1.0 öncesi CRUD negatif test kapanışı

Temel ürün CRUD'u v1.0 olarak etiketlenmeden önce aşağıdaki açık test koşulları tamamlanıp tüm kalite kapıları geçmelidir:

- [x] Update API'sinde her ürün alanı için geçersiz değer matrisi; başarısız güncelleme sonrasında tüm alanlar ve `updated_at` değişmemeli.
- [x] Admin düzenleme formunda geçersiz alan matrisi; istek gönderilmemeli, kayıt değişmemeli ve kullanıcıya doğrulama hatası gösterilmeli.
- [x] DELETE endpoint'inde geçersiz bearer token; silme UI'sında `401` ve `404` yanıtları güvenli biçimde gösterilmeli, ürün katalogda kalmalı.
- [x] Silme isteği beklerken eylem devre dışı olmalı ve yinelenen DELETE gönderilmemeli.
- [x] Backend ve frontend tam test/coverage, lint, TypeScript build ve Playwright E2E geçmeli; gereksinim-test izlenebilirliği güncel olmalı.
- [x] Keycloak geçişi sonrası admin ürün ekleme/güncelleme/silme E2E regresyonlarını geri ekle; buyer'ın güncel ürünü gördüğünü ve create/update/delete işlemlerinde `403` aldığını doğrula. Geçersiz/çakışan form girdilerini, geçici Keycloak kullanıcılarının temizliğini ve izole ürün veritabanını kapsa.
- [x] Tag öncesi çalışma ağacı ve release notları incelenmeli; test/build raporları üretilen artefakt olarak saklanmalı. (Release notları: [docs/release-notes-v1.0.0.md](./docs/release-notes-v1.0.0.md); kapı sonuçları 21 Kasım 2026'da `dc72e5f` üzerinde yerelde ve CI'da doğrulandı.)

**Çıkış ölçütü:** Tüm maddeler yeşil, kritik iş kuralı boşluğu yok, `docs/requirements.md` gereksinim durumu tamamlandı ve `v1.0.0` etiketi/özet sürüm notu hazırlanabilir.

### Öncelik 1 — REQ-006: Keycloak ile alıcı kaydı ve rol tabanlı kullanıcı yönetimi

**Amaç:** Ziyaretçi kendi alıcı hesabını açabilsin; Keycloak kimlik doğrulamayı, backend ise mağaza kaynaklarına erişim yetkisini güvenli biçimde yönetsin. Bu öncelik yalnızca alıcı registration/login ve OIDC geçişini kapsar; satıcı ve admin akışları sonraki sıralı gereksinimlerdir.
**Durum:** Tamamlandı. Genel yinelenen-hesap mesajı gerçek Keycloak E2E ile doğrulandı; unit/API/component/E2E kalite kapıları geçti.

- Keycloak'ı yerel geliştirme ortamına ekle; web istemcisi ve FastAPI için OIDC yapılandırmasını yap.
- Alıcı için e-posta/parola ile self-service kayıt ve Authorization Code + PKCE tabanlı giriş akışını kur. Parola uygulama backend'ine uğramamalı.
- Token issuer, audience, imza, süre ve rollerin backend doğrulamasını uygula; mevcut ürün CRUD yetkilerini yeni token/role modeline taşı.
- `buyer`, `seller`, `admin` profillerini ayır. Herkese açık kayıt yalnızca `buyer` verir; `seller` ve `admin` ataması güvenilir yönetim süreciyle yapılır.
- Duplicate e-posta, geçersiz kayıt, rol yükseltme, bozuk/expired/yanlış issuer-audience token, yetkisiz ürün işlemi ve Keycloak erişim hatalarını test et.
- Keycloak test realm'i ve tekrarlanabilir test verisi kur; kayıt/giriş/rol sınırları için unit, API/entegrasyon, component ve E2E testleri ekle.
- Keycloak gerçek servisinin de kullanıldığı tarayıcı kayıt akışını test et; testler geçmeden REQ-007'ye başlama.
- Gerçek Keycloak E2E'de tekrar kayıt, eksik/biçimsiz alan, eşleşmeyen parola, kayıt sonrası giriş, parola gizliliği ve alıcı yetki sınırlarını doğrula.

**Bu dilimde ertelenen işler:**

- E-posta doğrulama: daha sonraki kimlik yaşam döngüsü iyileştirmesi; doğrulanmamış e-posta ile kayıt/giriş ilk sürümde mümkün.
- Parola sıfırlama ve değiştirme: daha sonraki kimlik yaşam döngüsü iyileştirmesi.
- Satıcı başvurusu, işletme/kimlik doğrulaması, ödeme bilgileri ve satıcı çalışan/alt rol yönetimi.
- Sosyal giriş, MFA ve gelişmiş oturum/cihaz yönetimi.

**Çıkış ölçütü:** Alıcı kendi hesabını oluşturup yeniden giriş yapar; rol/token kontrolleri backend'de uygulanır; unit/API/component/E2E testleri ve katalog/admin CRUD regresyonları geçer. Yinelenen e-posta geri bildirimindeki hesap keşfi riski için açık güvenlik kararı kayda alınır. E-posta doğrulama ve parola sıfırlama ayrı sonraki iş olarak kalır.

### Öncelik 2 — REQ-007: Satıcı başvurusu ve ilk inceleme

**Başlama koşulu:** REQ-006 alıcı registration/login gereksinimi ve kapsamlı test kapısı tamamlanmış olmalı.

**Amaç:** Giriş yapmış alıcı bireysel, şahıs işletmesi veya şirket olarak mağaza başvurusu yapabilsin; admin manuel inceleyebilsin; Keycloak `seller` rolü yalnızca onay süreci tamamlandığında verilsin.

**Durum:** Tamamlandı. Backend/veri modeli, buyer başvuru arayüzü, admin inceleme arayüzü, satıcı ürün sahipliği ve katmanlı testler gerçek Keycloak akışıyla doğrulandı.

- REQ-007 gereksinimi `docs/requirements.md` içinde tanımlandı: bireysel/şahıs işletmesi/şirket türü; yasal ad/unvan, mağaza adı, irtibat telefonu, il/ilçe, ana kategori ve kısa işletme tanıtımı. Keycloak `sub` ve e-posta token'dan alınır.
- İlk sürümde yalnızca beyan bilgileri admin tarafından manuel incelenir; belge dosyası, T.C. kimlik/vergi numarası, banka bilgisi ve tam adres toplanmaz. Onay, öğrenme uygulamasında satıcı rolü ve mock marketplace yetkileri verir; formal KYC veya mevzuata uygunluk teyidi değildir.
- Otomatik KYC/KYB entegrasyonu ve gerçek ticari uygunluk doğrulaması bu projenin kapsamı dışındadır.
- Durum makinesi: `draft → submitted → under_review → changes_requested / approval_pending / rejected`; Keycloak rol atama başarıyla doğrulanınca `approval_pending → approved`. Rol ataması başarısız olursa seller yetkisi verilmez ve işlem güvenle tekrar denenir.
- Bir alıcıya en fazla bir aktif başvuru; ret sonrası yeni başvuru yeni kayıt olarak açılır. Admin kararları aktör, zaman ve sonuçla audit edilir.

**Geliştirme tamamlandıktan hemen sonra — test geliştirme planı:**

- **Unit:** Alan/format/sınır doğrulamaları, işletme türüne göre alan koşulları, başvuru durum makinesi, izin verilmeyen geçişler ve rol atama kararları.
- **API/entegrasyon:** Buyer'ın kendi başvurusunu oluşturma/görüntüleme/güncellemesi; başka kullanıcı başvurusuna erişim; duplicate aktif başvuru/mağaza adı; eksik/uygunsuz beyan; review/changes/reject/approve; başarısız durumda kalıcılığın ve rolün değişmemesi.
- **DB/migration:** Yeni başvuru ve işletme tabloları, ilişkiler, unique/foreign-key kısıtları, migration upgrade/downgrade ve transaction rollback.
- **Keycloak entegrasyon:** Onay öncesi `seller` claim olmaması; rol atama başarısızlığında `approval_pending`/retry; tekrarın idempotent olması; başarılı atamadan sonra yeni token'da rolün görünmesi.
- **Component:** Başvuru formu doğrulaması, durum ekranları, yükleme/başarı/hata, changes-requested düzenlemesi ve admin karar akışı.
- **E2E:** Gerçek Keycloak buyer başvurur, mevcut admin inceler; gönderim/inceleme öncesi seller yetkisi yoktur; onaydan sonra yeni oturumda seller rolü görünür. Yetkisiz review ve onaysız seller erişimi reddedilir.
- **Güvenlik/regresyon:** Kimlik/vergi/banka/belge verisi toplanmaması ve yanıt/loglarda credential sızmaması; buyer kayıt/login, ürün katalog ve admin CRUD regresyonları korunur.

**İlerleme kontrol listesi**

- [x] Başvuru şeması, durumlar, audit kaydı, API yetkilendirmesi ve migration.
- [x] Admin onayı, Keycloak seller-role provisioning servisi ve seller ürün sahipliği backend kuralları.
- [x] Buyer başvuru formu/durum paneli, admin review ekranı ve seller'ın sahip olduğu ürünler için CRUD kontrolleri.
- [x] API, provisioning mock, migration upgrade/downgrade ve frontend component/API testleri.
- [x] Gerçek Keycloak seller başvuru/onay E2E senaryosu yazıldı.
- [x] Mevcut Keycloak realm'inde service account secret, service-account rolleri ve açık client-scope eşlemeleri güvenli biçimde yapılandırıldı; secret yalnızca ignored `apps/api/.env` içinde.
- [x] Gerçek Keycloak E2E (buyer → admin review → seller role → yeni oturum → seller ürün yayını → buyer ortak katalog görünümü) geçti.
- [x] Tam API/web regresyonu, %100 frontend coverage, lint, build, migration ve `git diff --check` çıkış kapıları geçti.

**Çıkış ölçütü:** Başvuru ve admin kararları izlenebilir; Keycloak rol provisioning hataları başarı gibi gösterilmez; onaysız kullanıcı seller yetkisi kazanamaz. Marketplace içindeki satış yetkileri REQ-016'da netleştirilir; bu dilim formal KYC veya mevzuata uygunluk teyidi sağlamaz.

### Öncelik 3 — REQ-008: Admin rolü atama ve yönetici erişimi

**Başlama koşulu:** REQ-007 satıcı başvurusu/işletme doğrulaması ve test kapısı tamamlanmış olmalı.

**Amaç:** Platform yöneticisi rolü yalnızca güvenilir Keycloak operatörü tarafından atanıp geri alınabilsin; uygulama kullanıcısı kendi yetkisini yükseltemesin.

**Karar:** İlk admin bootstrap'i ve sonraki admin rolü atama/geri alma işlemleri yalnızca Keycloak Admin Console üzerinden yapılacak. Uygulama içi admin yönetim UI'ı veya admin-role mutation API'si geliştirilmeyecek. Son admin değişikliği öncesi etkin başka admin bulunduğu manuel kontrol edilecek; Keycloak bunu teknik olarak zorlamaz. Ayrı break-glass operatör hesabı korunacak.

**Durum:** Tamamlandı; Keycloak admin-event kaydı, operasyon dokümantasyonu ve gerçek Keycloak E2E regresyonu doğrulandı.

- REQ-008 kabul kriterleri ve operasyonel sınırlar `docs/requirements.md` içinde tutulur.
- Realm admin event kaydı açık, event payload/detail kaydı kapalı olmalı; persistent Keycloak realm'e ayar ayrıca uygulanmalı.
- Admin rolü public registration veya kullanıcı isteğiyle verilememeli; mevcut backend admin-only kontrolleri Keycloak claim'ini doğrulamaya devam etmeli.
- İlk admin, son-admin kontrolü/break-glass ve rol geri alma adımları dokümante edilmelidir.

**Geliştirme tamamlandıktan hemen sonra — test geliştirme planı:**

- **Unit/config:** Realm export'ta varsayılan rolün yalnızca `buyer`, admin'in varsayılan olmaması ve admin event/detail ayarları doğrulanmalı.
- **API/entegrasyon:** Buyer/seller admin-only endpoint'lerde `403` almalı; rol yükseltme için uygulama API route'u bulunmamalı; mevcut admin izin testleri korunmalı.
- **Keycloak entegrasyon:** İzole yerel realm'de güvenilir test bootstrap'i ile admin claim'i doğrulanmalı; rol kaldırıldıktan sonra yeni token/admin endpoint erişimi doğrulanmalı. Test kurulumu yalnızca test ortamında çalışmalı, credential'lar loglanmamalı.
- **Component:** Uygulama admin rolü yönetimi sunmayacağı için admin atama/kaldırma component'i yoktur; admin yetkisi olmayan kullanıcıya admin UI eylemleri görünmemesi mevcut regresyonla doğrulanır.
- **E2E/regresyon:** Gerçek Keycloak rolü ile admin ürün CRUD ve seller application review çalışmalı; buyer/seller için admin işlemleri UI ve API katmanında reddedilmeli.
- **Operasyonel audit/güvenlik:** Keycloak admin event'lerinde aktör ve rol değişikliği görülebilmeli; detay kaydı kapalı olmalı. Admin rolü kaldırmadan önce başka etkin admin bulunduğu manuel kontrol edilmeli ve break-glass hesap korunmalı; Keycloak'ın otomatik son-admin kilidi sunduğu varsayılmamalı.

**İlerleme kontrol listesi**

- [x] Uygulama içi admin rol yönetimi kapsam dışı; Keycloak Console-only yönetim kararı netleştirildi.
- [x] İlk admin Keycloak Console bootstrap'i, manuel son-admin kontrolü ve break-glass beklentisi belgelendi.
- [x] Realm admin event kaydı açıldı; event detayları kapatıldı; config testi eklendi.
- [x] Mevcut persistent Keycloak realm'inde admin event ayarları açıldı ve ayrıntı kaydı kapatıldı.
- [x] Gerçek Keycloak rol kaldırma/yeni token ve admin endpoint regresyonu için E2E senaryosu eklendi.
- [x] API testleri (166), Ruff, web lint/build, gerçek Keycloak E2E (7) ve `git diff --check` geçti.

**Çıkış ölçütü:** Admin yetkisi yalnızca güvenilir Keycloak konsolundan verilir/alınır; public kayıtla rol yükseltilemez; admin olayları ayrıntısız kaydedilir; son-admin kontrolü ve break-glass prosedürü uygulanır; regresyon kapıları geçer.

### Yerel PostgreSQL geliştirme ortamı

**Amaç:** API'nin ve Alembic'in yerel geliştirmede PostgreSQL kullanması; SQLite'ın hızlı/izole testlerin veritabanı olarak kalması.

**Durum:** Compose PostgreSQL servisi, kalıcı volume, loopback port eşlemesi ve SQLAlchemy/psycopg varsayılan bağlantısı eklendi. Mevcut migration zinciri PostgreSQL'e uygulandı. PostgreSQL uyumluluğu için 0005 revision kimliği 32 karakter sınırına indirildi.

**İlerleme kontrol listesi**

- [x] PostgreSQL Compose servisi, healthcheck, `postgres_data` volume'ü ve yalnızca `127.0.0.1:5432` portu.
- [x] API varsayılanı ve `.env.example` PostgreSQL'e taşındı; mevcut yerel `.env` korunarak bağlantı ayarı güncellendi.
- [x] Alembic migration zinciri gerçek PostgreSQL veritabanına uygulandı; `0006_customer_carts` head sürümü doğrulandı.
- [x] Ayrı `_test` veritabanına çalışan PostgreSQL test altyapısı eklendi; SQLite testi paketinden bağımsız ve varsayılan çalışmada opt-in/skip.
- [x] PostgreSQL gerçek migration, eşzamanlı ilk sepet oluşturma, alıcı bazlı stok sınırı, sepetlerin stok rezervasyonu olmaması, silinen ürün FK ve unique constraint testleri eklendi; 6/6 test geçti.

### Öncelik 4 — REQ-009: Müşteri sepeti

**Amaç:** Giriş yapmış müşteri ürünleri sepete ekleyebilsin, miktarı değiştirebilsin ve sepetten çıkarabilsin.

**Kararlar:** Sepet Keycloak subject'iyle kullanıcıya bağlanır. Ürünü tekrar eklemek miktarı artırır; sepet güncel katalog fiyatını gösterir ve checkout'ta yeniden doğrular; her ekleme/güncelleme güncel stoğa göre kontrol edilir. Ürün silinince satır korunur, kullanılamaz görünür ve yalnızca kaldırılabilir.

**Durum:** Backend, UI, migration ve katmanlı regresyon testleri tamamlandı. Backend 213 SQLite test ve %99,47 coverage; PostgreSQL'e özel 6 test; frontend 128 test ve tüm ölçümlerde %100 coverage; gerçek Keycloak E2E 8/8 geçti. PostgreSQL üzerinde sepet davranışları doğrulandı.

- Buyer-only API'de sepet sahibi istemciden alınmamalı; her kullanıcı sadece kendi sepetini okuyup değiştirebilmelidir.
- Ürün/miktar doğrulaması, tekrar eklemede miktar artırma ve güncel stok kontrolü backend'de atomik olmalıdır.
- Ürün silme, cart item'ı korumalı ve ürün referansını boşaltmalıdır; son bilinen ürün adı gösterilebilmelidir.
- UI'da katalogdan ekleme, sepet özeti, miktar değişikliği ve kaldırma; boş/yükleniyor/hata/stok uyuşmazlığı durumları ele alınmalıdır.

**Geliştirme ve test planı:**

- **Unit/şema:** Katı pozitif tam sayı miktarı, güncel fiyat/ara toplam/uygunluk hesapları ve silinmiş ürün temsili.
- **API/entegrasyon:** Listele/ekle/tekrar ekle/güncelle/sil; anonim ve buyer olmayan kullanıcı; başka kullanıcı kalemi; olmayan/silinmiş ürün; invalid miktar; stok/fiyat değişikliği; başarısız işlemde rollback.
- **DB/migration:** Benzersiz cart-owner ve cart/product ilişkileri, miktar ve FK kısıtları; upgrade/downgrade; ürün silinince satırın korunması; eşzamanlı mutation kontrolleri.
- **Component:** Katalogdan ekleme, sepet özeti, güncelleme/kaldırma ve boş/yükleniyor/hata/stok çakışması durumları.
- **E2E:** Gerçek Keycloak alıcısı ürün ekler, miktarı değiştirip kaldırır; ikinci kullanıcı ilk kullanıcının sepetini göremez; yenileme sonrası kalıcılık ve ürün silinmesi sonrası kullanılamaz satır doğrulanır.

**İlerleme kontrol listesi**

- [x] Backend API, modeller, migration, sahiplik/stok kuralları ve API/DB testleri tamamlandı.
- [x] Web sepet akışı ve hata/yükleme/boş/stok durumları component testleriyle doğrulandı; frontend coverage tüm ölçümlerde %100.
- [x] Backend regresyonu ve coverage, Ruff/format, web lint/build ve gerçek Keycloak E2E kalite kapıları geçti.
- [x] Yerel PostgreSQL servisi ayağa kaldırıldı ve Alembic head migration'ı uygulandı.
- [x] Ayrı PostgreSQL test veritabanında migration, eşzamanlı mutation/stok, cart-item FK ve unique constraint testleri geçti (6/6).

**Çıkış ölçütü:** Alıcı yalnızca kendi sepetini düzenler; hatalı, stok dışı veya yetkisiz mutation kalıcılaşmaz; API, UI, migration, PostgreSQL eşzamanlılık ve regresyon testleri geçer.

### Öncelik 5 — REQ-010: Sipariş oluşturma

**Amaç:** Müşteri sepetini doğrulayarak siparişe dönüştürebilsin; sipariş geçmişi satın alma anındaki ürün/fiyat bilgisini korusun.

- **Durum:** Tamamlandı. Backend SQLite ve PostgreSQL testleri 231/231 geçti, coverage %99,54; web testleri 141/141 ve %100 coverage; Keycloak E2E 8/8, build, Oxlint ve Ruff kalite kapıları başarılı.
- **Kararlar:** Checkout'ta güncel fiyat/stok doğrulanır ve stok aynı transaction içinde düşürülür. Sipariş `pending_payment` olur (REQ-011'e kadar ödeme yoktur). Başarılı checkout sepeti aynı transaction içinde boşaltır. `Idempotency-Key` zorunlu; aynı alıcı/anahtar tekrarı aynı siparişi döndürür. Sipariş kalemleri satın alma anı snapshot'larını korur.
- Sipariş, satır snapshot'ları, toplam, owner ve açık durum geçişleri için model/migration.
- Buyer-only checkout ve yalnızca sahibine açık sıralı sipariş geçmişi/detayı.
- Boş sepet, silinmiş ürün, yetersiz/değişmiş stok, duplicate/replay, transaction hatası ve eşzamanlı son stok yarışları.
- Sepetten checkout başlatma, onay özeti, işlemde/başarı/hata ve sipariş geçmişi arayüzü.

**Geliştirme tamamlandıktan hemen sonra — test geliştirme planı:**

- **Unit:** Tutar/snapshot hesaplama, sipariş durum makinesi, stok ve checkout iş kuralları; yuvarlama ve sınır değerleri.
- **API/entegrasyon:** Başarılı checkout ve tüm negatif koşullar; istemciden gelen fiyat/toplamı reddetme; idempotency; hatada stok/sepet/siparişin değişmemesi.
- **DB/transaction:** Sipariş, kalem snapshot'ı ve stok güncellemesi atomikliği; rollback; migration ve ilişkisel kısıtlar.
- **Component:** Onay özeti, submit tekrarını önleme, başarı ekranı, validation/API/bağlantı hataları.
- **E2E:** Buyer sepetten sipariş verir, geçmişte siparişi görür; ürün sonradan güncellense/silinse snapshot korunur; tekrar gönderim ikinci sipariş oluşturmaz.

**Çıkış ölçütü:** Sipariş ya tüm kalemleriyle ve stok etkisiyle oluşur ya da hiçbir değişiklik kalıcılaşmaz; sipariş tutarı istemci girdisine güvenmez ve daha sonra ürün değişse/silinse bile geçmiş tutar korunur.

**İlerleme kontrol listesi**

- [x] Stok düşürme/`pending_payment`, sepeti temizleme ve zorunlu idempotency-key kararları alındı; kabul kriterleri ve katmanlı test planı yazıldı.
- [x] Sipariş modeli/migration, transaction-safe checkout, sahiplik ve idempotent API.
- [x] SQLite unit/API/transaction/migration testleri ile PostgreSQL concurrency testleri.
- [x] Web sipariş oluşturma/onay ve geçmiş görünümü; component ve Keycloak E2E regresyonları.
- [x] Backend, frontend, PostgreSQL, Keycloak E2E ve build kalite kapıları.

### Öncelik 6 — REQ-011: Ödeme entegrasyonu

**Amaç:** Yerel öğrenme uygulamasında gerçek kart veya para hareketi olmadan mock ödeme akışı test edilebilsin.

- **Durum:** Mock sandbox dilimi tamamlandı: son backend varsayılan test koşusunda 239 test geçti, PostgreSQL için ayrılmış 10 test `SHOP_TEST_DATABASE_URL` ayarlı olmadığından atlandı; coverage %97,19 (eşik %95). Web 144 test/%100 coverage ve Keycloak E2E 8/8 önceki tam doğrulamada geçti; build/lint, Ruff ve `git diff --check` başarılı. Gerçek PSP ve canlı tahsilat/iade bu öğrenme projesinin kapsamı dışındadır.
- **Kararlar:** Mock hosted checkout; iki dakikalık ödeme süresi; kesin başarısızlık/iptal/zaman aşımında REQ-010’dan düşülen stok bir transaction içinde ve tek sefer iade edilir. Webhook imzası, tutar/para birimi ve event ID doğrulanır. Kart bilgisi uygulamaya alınmaz.
- Yalnızca geliştirme/test için mock hosted checkout ve ödeme adapter sözleşmesi.
- Ödeme modeli, migration, buyer sahipli ödeme başlatma/durum API’si ve zorunlu idempotency.
- İmzalı webhook, yinelenen/ters sıradaki olayların idempotent işlenmesi; ödeme başarı/ret/iptal ve expiry stok iadesi.
- Frontend hosted checkout yönlendirmesi ve sipariş ödeme durumlarının gösterimi.
- Gerçek sağlayıcı (iyzico veya başka PSP), sandbox hesabı/credential'ları ve canlı tahsilat/iade bu projenin kapsamı dışındadır.

**Geliştirme tamamlandıktan hemen sonra — test geliştirme planı:**

- **Unit:** Ödeme/sipariş durum geçişleri, imza doğrulama, idempotency ve tutar eşleştirme kuralları.
- **Mock adapter contract/entegrasyon:** Tamamlandı; imzalı, bozuk, yinelenen ve sıra dışı webhook ile başarı/ret/zaman aşımı ve state tutarlılığı test edildi.
- **API/DB:** Ödeme başlatma yetkisi ve sahiplik, idempotency, transaction sınırları, webhook tekrarında tek durum geçişi; kart verisinin DB/log/yanıt içinde bulunmadığı doğrulanmalı.
- **Component:** Tamamlandı; hosted checkout'a yönlendirme ile beklemede/başarılı/başarısız/iptal durumları doğrulandı. Başarısız/sona ermiş siparişte yeni ödeme denemesi desteklenmiyor; alıcı ürünleri elle yeniden sepete ekleyip yeni sipariş oluşturur.
- **E2E:** Tamamlandı; sentetik sandbox sonucu ile checkout→ödeme→sipariş durumu akışı doğrulandı, gerçek kart verisi kullanılmadı.
- **Test doubles:** Gerçek sağlayıcı gerektiren bir QA senaryosu çıkarsa fake provider ve contract testleri kullanılacak; gerçek sağlayıcı credential'ı gerekmiyor.
- **Güvenlik/regresyon:** Webhook imzası atlatılamamalı; farklı sipariş/kullanıcıya ait ödeme güncellenememeli; önceki checkout akışı korunmalı.

**Çıkış ölçütü:** Yinelenen veya doğrulanmamış bildirim ikinci kez ödeme/sipariş/stok geçişi yaratmaz; iki dakika sonunda bekleyen ödeme sona erer ve stok bir kez serbest bırakılır; kart verisi uygulamaya hiç girmez.

**İlerleme kontrol listesi**

- [x] Mock-first sağlayıcı yaklaşımı, 2 dakikalık ödeme penceresi ve başarısız/iptal/sona erme stok kararı netleştirildi ve gereksinime işlendi.
- [x] Ödeme modeli/migration, provider adapter ve hosted sandbox checkout.
- [x] İmzalı webhook, ödeme/sipariş geçişleri, expiry worker ve transaction/idempotency testleri.
- [x] Web ödeme yönlendirmesi ve durum ekranı; component/Keycloak E2E.
- [x] SQLite + PostgreSQL testleri, frontend kalite kapıları ve mock sandbox kapsamındaki REQ-011 çıkış ölçütleri.
- [x] **Ödeme tekrar denemesi politikası (26 Kasım):** İptal edilen sipariş yeniden açılmaz; alıcı sepeti kendisi hazırlayıp yeni checkout, sipariş ve ödeme anahtarları kullanır. Fiyat/stok yeniden değerlendirilir; aynı ödeme anahtarıyla idempotent tekrar son durumdaki mevcut kaydı döndürür. Başarısız/iptal/expiry senaryolarını içeren ödeme ve sipariş testleri 34/34, Ruff lint/format geçti. Siparişten sepete isteğe bağlı ekleme REQ-023'te ele alınır; otomatik checkout ve gerçek PSP kapsam dışıdır. Ayrıntı ve kabul ölçütleri [REQ-011](./docs/requirements.md#req-011--ödeme-entegrasyonu) içinde.
- [x] Gerçek PSP/credential entegrasyonu proje kapsamı dışındadır; sağlayıcı davranışları gerektiğinde fake provider ile test edilir.

### Öncelik 7 — REQ-012: Sipariş takibi ve operasyonel tamamlayıcılar

- **Durum:** İlk dilim tamamlandı. SQLite backend 244 test geçti (%96,89 coverage), PostgreSQL entegrasyon testleri 11/11, web 148 test (%100 coverage), Keycloak E2E 8/8 geçti; build/lint/Ruff başarılı.
- **Kararlar:** Buyer yalnızca kendi zaman damgalı sipariş geçmişini görür. Admin durumları sırayla `paid → processing → shipped → delivered` ilerletir; taşıyıcı entegrasyonu yoktur. Ödeme bekleyen siparişlerin otomatik iptal/stoğa iadesi REQ-011'deki gibi kalır. Admin, yalnızca ödenmiş ve kargoya verilmemiş siparişi gerekçe ile iptal edip yerel `refunded` kaydı oluşturabilir; sipariş iptal olur ve stok tek transaction'da bir kez döner. Bu işlem gerçek para iadesi değildir. `shipped`/`delivered` ürün iadesi ayrı gereksinimdir.
- Sipariş durum geçmişi tablosu ve mevcut siparişleri kapsayan audit migration'ı.
- Buyer sipariş geçmişinde güncel durum ve olay zaman çizelgesi; audit aktör kimliği buyer yanıtından gizlenir.
- Admin sipariş liste/detay API'si, durum filtresi ve bounded pagination.
- Sıradaki tek geçişe izin veren, tekrarlandığında yeni olay üretmeyen admin durum güncellemesi.
- `paid`/`processing` + başarılı ödeme koşulunda gerekçeli admin yerel iadesi; payment `refunded`, order `cancelled`, stok ve audit atomik/idempotent.
- Admin sipariş listesi, ilerleme ve yerel iade arayüzü; mock iadenin para transferi olmadığı görünür.

**Test planı ve çıkış ölçütleri:**

- **Unit/API/DB:** Buyer/admin rol sınırı; geçiş sırası/atlama/tekrar; pending/shipped/delivered iade reddi; audit actor/gerekçe/zaman; tek sefer stok iadesi; migration upgrade/downgrade.
- **Component:** Buyer geçmişi/timeline; admin liste/manuel durum/iade; boş/loading/error ve iade sınırı metni.
- **E2E:** Buyer siparişi oluşturur ve izler; admin yetkili işlemi uygular; buyer admin mutation'ı `403` ile alamaz.
- **Regresyon/kalite:** REQ-010 checkout ve REQ-011 mock ödeme/expiry akışları, PostgreSQL transaction/race ve web build/lint/testleri.

**Çıkış ölçütü:** Her sipariş geçişi yetkili ve denetlenebilir; admin/buyer görünümleri tutarlı; iade ve stok etkisi transaction içinde, idempotent ve açıkça yerel mock işlemidir.

**İlerleme kontrol listesi**

- [x] Kapsam, manuel durumlar ve kargoya verilmeden önce yerel iade/stock/audit politikası kararlaştırıldı.
- [x] Order status audit modeli, migration/backfill ve API şemaları.
- [x] Buyer timeline ve admin liste/durum/iade API'leri; rol, sıra ve tekrar güvenliği.
- [x] Buyer/admin web arayüzleri ve component/API testleri.
- [x] SQLite backend API/migration, coverage eşiği ve ödeme regresyon testleri; web testleri/build/lint.
- [x] PostgreSQL entegrasyon ve eşzamanlılık testleri 11/11 geçti.
- [x] Keycloak E2E 8/8 geçti; checkout → mock ödeme → admin durum/iade ve alıcı geçmişi dahil.

### Sıradaki gereksinimler — sıralı backlog

Canlıya çıkış, gerçek ödeme sağlayıcısı, kargo/taşıyıcı veya KYC/KYB entegrasyonu ve üretim altyapısı bu projenin kapsamı dışındadır. Yeni dilimler yerel/mock akışlarla otomasyonla doğrulanabilir iş kurallarını ve test katmanlarını artırır.

1. **REQ-013 — Katalog arama, filtreleme ve sıralama:** Tamamlandı.
2. **REQ-014 — Teslimat sonrası yerel ürün iadesi (tamamlandı):** Buyer shipped/delivered siparişte 30 gün içinde kalem bazında kısmi/tam miktar için otomatik onaylanan yerel iade talebi açar; ödeme/iade kaydı ve stok tek transaction'da, idempotent uygulanır. Gerçek para/kargo yok.
3. **REQ-015 — Adres defteri ve yerel teslimat seçenekleri (tamamlandı):** Buyer çoklu adres CRUD/default; Standart 49,90 TL, Hızlı 89,90 TL; ürün ara toplamı 1.000 TL ve üzerindeyse yalnız Standart ücretsiz. Sipariş adres/ücret snapshot'ı değişmez; gerçek taşıyıcı yok. Ürün iadeleri teslimat ücretini kapsamaz.
4. **QA-016 — API sözleşme/regresyon otomasyonu (tamamlandı):** Sürümlü OpenAPI snapshot, üretilen modeller, istemci tip/yol/yöntem/başlık kontrolleri ve CI.
5. **QA-017 — Erişilebilirlik otomasyonu (tamamlandı):** WCAG 2.1 A/AA axe taramaları, kritik akışlarda klavye sırası ve görünür odak kontrolleri.
6. **QA-018 — PostgreSQL testlerinin CI'a eklenmesi (tamamlandı):** CI'da izole PostgreSQL 17 servisi, yalnızca `shop_test` veritabanı ve migration/entegrasyon testleri; SQLite testlerinden bağımsız kalite kapısı.
7. **QA-019 — CI'da deterministik E2E (tamamlandı):** PR'larda yerel test JWKS sağlayıcısı ve ephemeral RSA anahtarıyla Keycloak/harici servis gerektirmeyen gerçek API+SQLite buyer checkout/mock ödeme akışı; gerçek Keycloak E2E ayrıca korunur.
8. **QA-020 — Test sınıflandırması ve çalışma sıklığı (tamamlandı):** Pytest marker'ları ve Playwright tag'leri; PR'da regresyon + smoke, nightly/elle tetiklenen kapsamlı Keycloak E2E ve raporlama.
9. **QA-021 — Coverage kapsamının netleştirilmesi (tamamlandı):** kritik UI panelleri ve auth coverage kapsamına eklendi; mevcut üç dosyanın %100 kapısı korundu, genişletilmiş kapsam için toplam/dosya eşikleri ve ölçülen dosyaların CI raporlaması eklendi.
10. **QA-022 — API yanıt sözleşmesi doğrulaması (tamamlandı):** temsilî gerçek API yanıtları sürümlü OpenAPI şemalarına doğrulanır; frontend'in tip/yol/yöntem/başlık kontrolleri sözleşme kapısında kalır.
11. **QA-023 — Tarayıcıda erişilebilirlik kapsamı (tamamlandı):** Chromium axe WCAG 2.1 A/AA buyer/admin akışlarında; kontrast kusurları giderildi, 320px mobil genişlikte yatay taşma kapısı eklendi.
12. **QA-024 — E2E mimarisi ve standartlaştırma (tamamlandı):** ortak scenario fixture'ı/API seed, retry başına benzersiz kimlik ve Keycloak login için ince POM; deterministik E2E 4/4, gerçek Keycloak E2E 10/10 geçti.
13. **QA-025 — Bağımlılık güvenlik kapıları (tamamlandı):** lockfile bazlı npm/pip-audit kapıları, rapor artefaktları ve zafiyet bulgusunda CI başarısızlığı.
14. **REQ-016 — Satıcı onayı ve marketplace yetkileri (tamamlandı):** Admin onayı + Keycloak `seller` rolü + `approved` başvurunun birlikte aranması; ürün sahibi ve mevcut buyer yetkileri korunur. Gerçek KYC yoktur.
15. **REQ-017 — Marketplace satıcı sipariş operasyonları (tamamlandı):** Çok satıcılı sepet tek buyer sipariş/ödeme üretir; satıcı başına fulfillment durumu ve kalem izolasyonu sağlanır. Yerel Keycloak E2E 11/11, web 227/227 ve etkilenen API testleri 32/32 geçti. Taşıyıcı entegrasyonu yoktur.
16. **REQ-018 — Alıcının sipariş iptali (tamamlandı):** Alıcı kendi uygun siparişini iptal edebilir; mock ödeme/iade, stok ve PostgreSQL üzerinde tekrar/yarış güvenliği uygulanır. Gerçek para hareketi yoktur.
17. **Düzeltme — Satıcı gönderimi sonrası alıcı iadesi (tamamlandı):** Seller fulfillment geçişlerinin oluşturduğu sipariş olayları da mevcut 30 günlük iade kuralında API ve UI tarafından kabul edilir.
18. **Düzeltme — Ödeme expiry hata izolasyonu (tamamlandı):** Stok sınırı nedeniyle kapatılamayan bir sipariş, diğer siparişlerin expiry işlemini veya ilgisiz ödeme isteklerini engellemez; hatalı sipariş ve hatası görünür kalır.
19. **QA-026 — Performans başlangıç çizgisi (tamamlandı):** sınırlı yük profili, ölçülebilir eşikler ve tekrarlanabilir rapor; hedefleri tutmayan sonuçlar ve sonraki işler ayrıca izlenir.

REQ-013–REQ-018, QA-016–QA-026 ve performans öncesi iki işlevsel düzeltme tamamlanmıştır. Güncel açık işler ve bağımlılıkları aşağıdaki takip bölümlerindedir.

#### QA-024 — E2E mimarisi ve standartlaştırma (tamamlandı)

- **Amaç:** Playwright E2E testlerinde tekrar kullanılabilirliği ve okunabilirliği artırırken orta ölçekli projeye gereksiz soyutlama eklememek.
- **Benimsenen yaklaşım:** Test verisi ve başlangıç durumu mümkün olduğunca gerçek FastAPI test API'si üzerinden hazırlanır; ortak kimlik doğrulama ve altyapı Playwright fixture'larında tutulur. Tekrarlanan, kararlı UI bölgeleri için ince POM'lar kullanılır; spec'ler sayfadan çok buyer/admin gibi iş senaryolarına göre düzenlenir. Çok adımlı Composer/Journey katmanı ancak aynı akış en az üç senaryoda tekrarlandığında değerlendirilir.
- **Uygulama:** `e2e/fixtures.ts` test başına repeat/retry/worker ile ayrışan scenario ID, rol token'ı, browser auth ve ürün/adres/sepet/sipariş API hazırlığını sunar. Deterministik checkout ve erişilebilirlik senaryoları bu fixture'a taşındı. `KeycloakLoginPage` birden fazla Keycloak spec'inde tekrar eden hosted login UI adımlarını kapsar; çok adımlı business flow'lar spec'lerde kaldı.
- **Sınırlar:** E2E senaryosunun doğrulamakta olduğu davranış UI üzerinden sürdürülür; API hazırlığı doğrulanması gereken UI davranışını atlamaz. Veritabanına doğrudan erişim varsayılan seed yöntemi değildir. Tek kullanımlık/yalın kontroller için POM veya Composer zorunlu tutulmaz.
- **Doğrulama:** Deterministik kipte `npm run test:e2e` 4/4 geçti (Keycloak etiketli 10 senaryo bu kipte beklenen şekilde skip); `E2E_KEYCLOAK_E2E=1` ve yerel Keycloak bootstrap ayarıyla `npm run test:e2e:keycloak` 10/10 geçti. `npm run lint` ve `npm run build` başarılı.

#### QA-025 — Bağımlılık güvenlik kapıları (tamamlandı)

- **Amaç:** Kilitli frontend ve backend bağımlılıklarında bilinen zafiyetleri her push/PR'da bulmak, anlaşılır rapor sağlamak ve güvenlik bulgularını CI kalite kapısı yapmak.
- **Tarama:** `npm audit --audit-level=low` doğrudan `apps/web/package-lock.json` ağacını tarar. Backend'de `uv export --locked` tüm runtime ve varsayılan dev bağımlılıklarını hash'li requirements dosyasına çıkarır; sürümü sabitlenmiş `pip-audit` bu tam listeyi hash zorunluluğu ve pip çözümlemesi olmadan tarar.
- **Başarısızlık politikası:** npm low/moderate/high/critical bulgularının tümü ve pip-audit'in bildirdiği tüm Python zafiyetleri PR/push kalite kapısını başarısız kılar. Ağ/servis/lockfile/tarama hataları da başarısız olur. Otomatik `audit fix` veya sessiz/baseline suppress yoktur; istisna gerekiyorsa CVE/etki/süre ve kaldırma koşulu belgelenip gözden geçirilmelidir.
- **Raporlama:** Frontend'in okunabilir npm audit raporu ve backend'in pip-audit tablo çıktısı mevcut frontend/backend CI artefaktlarına eklenir ve 14 gün tutulur. Bulgu olduğunda rapor iş logunda da gösterilir.
- **Doğrulama:** npm audit 0 advisory, pip-audit temiz kilitli liste taraması başarılı. Eski `pytest==8.4.2` üzerinde `PYSEC-2026-1845` test probu audit'ten non-zero çıkış aldı; güvenli sürüme geçince temiz tarama verdi. Backend pytest 289 geçti/14 PostgreSQL testi atlandı; Ruff lint/format, frontend lint/build ve `git diff --check` geçti.

Önceki maddelerdeki frontend coverage yüzdeleri, ilgili koşuda ölçüme dahil edilen dosyalar içindir; tüm frontend'in coverage'ı olarak yorumlanmamalıdır.

### Öncelik 8 — REQ-013: Katalog arama, filtreleme ve sıralama

- **Durum:** Tamamlandı. Backend regresyonu 249 geçti (%96,94 coverage), PostgreSQL entegrasyonu 12/12, web 152 test ve %100 coverage, gerçek Keycloak E2E 8/8 geçti; build/lint/Ruff başarılı.
- **Amaç:** Alıcının korumalı ürün kataloğunda arama yapıp kategori/fiyatla sonuçları daraltması ve sıralaması.
- **Kapsam:** Mevcut ürün endpoint/UI; migration veya dış arama servisi yok. Search name/category/description içinde partial, case-insensitive; category exact case-insensitive. Price range inclusive; sıralama `id`, `name`, `price_asc`, `price_desc`; pagination sonrası değil filtre sonrası total.

**Test planı / çıkış ölçütleri:**

- **Unit/API:** trim/case/wildcard davranışı, alanlar arası arama, kategori, dahil fiyat uçları, tek taraflı filtre, invalid aralık/parametre, sıralama tie-break, filtreli total ve pagination.
- **DB:** SQLite ve PostgreSQL'de aynı sorgu davranışı; yeni migration beklenmez.
- **Component/API client:** Filtre formu ve URL parametreleri, sonuç sayısı, boş sonuç, ters fiyat aralığının API'ye gitmeden reddi, loading/error/retry.
- **E2E:** Gerçek Keycloak alıcısı, önceden hazırlanmış ürünlerde arama/filtre/sıralama yapar; görünür sonuç ve backend yanıtı tutarlıdır.
- **Regresyon:** Varsayılan katalog, buyer/seller/admin yetkileri, CRUD, sepet ve checkout akışları korunur.

**İlerleme kontrol listesi**

- [x] QA hedefi ve REQ-013 önceliği netleştirildi; gerçek PSP/canlı operasyon kapsam dışı bırakıldı.
- [x] Kabul kriterleri ve test izlenebilirliği `docs/requirements.md` içinde dokümante edildi.
- [x] Backend filtreleme/sıralama; arama alanı, wildcard, kategori, fiyat uçları, kararlı sıralama, hata ve pagination API testleri.
- [x] Web/API client filtreleme arayüzü ve component testleri; web coverage %100.
- [x] PostgreSQL sorgu uyumu 12/12 ve Keycloak E2E 8/8.
- [x] Backend regresyon/coverage, web coverage/build/lint, Ruff/format ve `git diff --check`.

### Öncelik 9 — REQ-014: Teslimat sonrası yerel ürün iadesi

- **Durum:** Tamamlandı. Backend 259 geçti, 13 atlandı ve coverage %95,85; PostgreSQL testleri 13/13, web 154 test ve %100 coverage, Keycloak E2E 9/9 geçti. Web build/lint başarılı.
- **Amaç:** Buyer, `shipped` veya `delivered` siparişindeki belirli bir kalemin bir kısmı ya da kalan tamamı için iade kaydı oluşturabilsin. Kurallar sağlanınca talep otomatik onaylanır; gerçek para/kargo işlemi yapılmaz.
- **Kararlar:** İade penceresi son `shipped`/`delivered` geçişinden itibaren 30 gündür; shipped durumunda son sevk olayı, delivered olduğunda teslim olayı başlangıç kabul edilir. Her kalemin iade edilmiş toplam miktarı satın alınan miktarı aşamaz. Onayda yerel iade tutarı kaydedilir; ödeme `partially_refunded` veya tüm sipariş tutarı iade edildiğinde `refunded` olur. Mevcut ürün stokuna iade miktarı eklenir; silinmiş ürünün ürün snapshot'ı korunur fakat stok geri eklenemez.
- **Veri/API:** İade kaydı, kalem, miktar, gerekçe, tutar, sahibi, idempotency anahtarı ve zaman; buyer endpoint'i ile istek ve order history yanıtında görünür. Yeni migration, SQLite/PostgreSQL uyumu.

**Test planı / çıkış ölçütleri:**

- **Unit/API:** delivered/shipped uygunluğu; 30 günlük pencere ve sınır anı; buyer sahipliği/rol; kalem ve miktar doğrulaması; kalan miktar; duplicate ve payload uyuşmazlığı; tam/kısmi ödeme iadesi hesaplama.
- **DB/transaction:** Sipariş/kalem/ödeme/stok aynı transaction'da; eşzamanlı tekrarlar toplam iade miktarını aşamaz; stok sınırında rollback; silinmiş ürün.
- **Migration:** upgrade/downgrade, ödeme status constraint ve iade tabloları.
- **Component:** iade formu, yalnızca uygun sipariş/kalemlerde eylem, miktar/gerekçe, loading/error/başarı ve yerel iadenin gerçek para transferi olmadığı metni.
- **E2E:** gerçek Keycloak buyer checkout/ödeme sonrası sipariş shipped/delivered olur, kısmi/son kalan iade yapar; miktar ve ödeme özeti yenilemede korunur.
- **Regresyon/kalite:** önceki admin full-order cancellation/refund, checkout/expiry, SQLite/PostgreSQL, coverage, web ve E2E kapıları.

**İlerleme kontrol listesi**

- [x] İade uygunluğu (shipped/delivered), kısmi miktar, otomatik karar, atomik yerel iade/stok ve 30 günlük süre kararlaştırıldı.
- [x] Gereksinim ve test izlenebilirliği dokümante edildi.
- [x] Model/migration ve backend endpoint/testleri.
- [x] Buyer arayüzü ve component/API testleri.
- [x] PostgreSQL concurrency ve gerçek Keycloak E2E.
- [x] Tam ilgili regresyon/kalite kapıları.

### Öncelik 10 — REQ-015: Adres defteri ve yerel teslimat seçenekleri

- **Durum:** Tamamlandı. SQLite backend 274 test geçti, PostgreSQL için 14 test ayrı koşuda 14/14 geçti; backend coverage %95,49. Web 170 test geçti ve mevcut kapsam yapılandırmasındaki üç dosyada coverage %100; gerçek Keycloak E2E 10/10, build/lint ve Ruff başarılı.
- **Kararlar:** Buyer birden fazla Türkiye adresi ekleyebilir/düzenleyebilir/silebilir; isteğe bağlı tek varsayılan adres bulunur. Zorunlu alanlar alıcı adı, adres başlığı, telefon, il, ilçe ve açık adrestir; posta kodu isteğe bağlıdır. Standart 49,90 TL, Hızlı 89,90 TL; ürün ara toplamı 1.000 TL ve üzerindeyse yalnız Standart ücretsizdir. Ürün iadesi teslimat ücretini kapsamaz; adres/method/ücret siparişte snapshot olur. Gerçek taşıyıcı ve adres servisi yoktur.
- **Veri/API:** Buyer adres defteri CRUD ve sahiplik sınırı; checkout adres kimliği ve teslimat yöntemi ister. Adres alanları, ürün ara toplamı, yöntem, ücret ve toplam siparişle beraber değişmez saklanır. Önceki siparişlerde adres snapshot'ı olmayabilir.

**Test planı / çıkış ölçütleri:**

- **Unit/API:** Adres alanı/telefon/posta kodu doğrulaması, normalizasyon, adres sahibi/rol, CRUD ve tek varsayılan kuralı; checkout adresi/yöntemi; ücret eşiği ve ödeme toplamı.
- **DB/transaction:** Address migration ve SQLite/PostgreSQL partial unique default; order snapshot migration ve eski sipariş uyumu; checkout stok, sipariş ve adres snapshot'ını atomik kaydeder; ayrı ödeme işlemi sipariş toplamını kullanır.
- **Component/API client:** Adres ekle/düzenle/sil/default, boş/yükleme/hata; teslimat seçimi ve ürün ara toplamı/ücret/genel toplam.
- **E2E:** Gerçek Keycloak alıcısı adres kaydeder, iki teslimat yöntemini ve eşik altı/üstünü doğrular; adresi değiştirip silse de sipariş geçmişi snapshot'ı korunur.
- **Regresyon/kalite:** REQ-009–014 sipariş, sepet, ödeme, iade ve admin akışları; backend coverage, PostgreSQL, web coverage/build/lint ve Keycloak E2E.

**İlerleme kontrol listesi**

- [x] Adres defteri, alan/telefon doğrulaması, seçenek/ücret, ücretsiz eşik ve iade politikası kararlaştırıldı.
- [x] Gereksinim ve test izlenebilirliği dokümante edildi.
- [x] Address CRUD modeli/migration/API ve backend testleri.
- [x] Checkout ücret hesabı, sipariş snapshot'ı ve PostgreSQL testleri.
- [x] Buyer adres defteri/checkout UI ve component/API testleri.
- [x] Keycloak E2E ve ilgili regresyon/kalite kapıları.

### Öncelik 11 — QA-017: Erişilebilirlik otomasyonu

- **Durum:** Tamamlandı. Kritik buyer/admin bileşenlerinde axe WCAG 2.1 A/AA taramaları, Chromium giriş ekranı kontrast taraması ve klavye/odak testleri geçiyor.
- **Kapsam:** Ürün formu, adres defteri, sepet/checkout, buyer sipariş geçmişi ve admin sipariş yönetimi. Otomatik taramalar mevcut web test ve Playwright CI işlerinde çalışır.
- **Çözülen bulgu:** Chromium taraması giriş ekranında WCAG AA metin kontrastını karşılamayan 13 metin öğesi tespit etti; metin renkleri eşiklere göre koyulaştırıldı/açıklaştırıldı ve tarama temiz geçti.
- **İzlenebilirlik:** `apps/web/src/accessibility.test.tsx` bileşen taramalarını ve klavye sırasını; `apps/web/e2e/accessibility.spec.ts` gerçek tarayıcı kontrastını, giriş eylemlerine klavye erişimini ve görünür focus ring'i doğrular.
- **Sınırlar:** JSDOM bileşen taramaları renk kontrastı ve gerçek görsel düzeni ölçmez. Tarayıcı taraması giriş ekranıyla sınırlıdır; ekran okuyucu, büyütme/reflow ve manuel erişilebilirlik değerlendirmesi kapsam dışıdır.

### Öncelik 12 — QA-018: PostgreSQL testlerinin CI'a eklenmesi

- **Durum:** Tamamlandı. PostgreSQL 17 üzerinde migration ve entegrasyon paketi ayrı CI işinde çalışır; sonuçlar birleşik rapora eklenir ve iş başarısız olursa workflow başarısızdır.
- **Kapsam:** PostgreSQL servisi her workflow koşusunda ephemeral'dır. `SHOP_TEST_DATABASE_URL` yalnız `shop_test` veritabanını hedefler ve uygulama migration'ları ile PostgreSQL işaretli testler bu veritabanında çalışır. Mevcut SQLite backend testi bağımsız kalır.
- **Test izlenebilirliği:** `apps/api/tests/test_cart_postgres.py` ürün filtreleri, cart constraints/concurrency, checkout/stock yarışı, ödeme webhook/idempotency, admin refund, return, expiry ve address/checkout snapshot davranışını kapsar.
- **Raporlama:** PostgreSQL JUnit XML artefaktı 14 gün saklanır; `scripts/ci-summary.mjs` ayrı PostgreSQL kalite aşamasını ve test sayısını raporlar.

### Öncelik 13 — QA-019: CI'da deterministik E2E

- **Durum:** Tamamlandı. Varsayılan Playwright koşusu test-only JWKS sağlayıcısı ve her koşuda üretilen RSA anahtarıyla Keycloak/credential gerektirmeden gerçek Chromium → web → API → geçici SQLite buyer checkout/mock ödeme akışını doğrular. Buyer ürün yönetimi denemesi `403` ile reddedilir.
- **Kapsam:** CI ve yerel varsayılan E2E koşusu Keycloak'a bağlanmaz. Gerçek Keycloak kayıt/giriş/rol senaryoları mevcut biçimde kalır; yalnız `E2E_KEYCLOAK_E2E=1` açıkça ayarlandığında çalışır.
- **Test izlenebilirliği:** `apps/web/e2e/qa-019-deterministic.spec.ts` kritik buyer senaryosunu; `apps/web/e2e/deterministicAuth.ts` geçici OIDC test token'ını; `apps/web/e2e/start-test-identity.mjs` sadece public JWKS sunumunu doğrular. `apps/web/playwright.config.ts` izole veritabanını, test sağlayıcısını ve Chromium sunucularını düzenler.
- **Sınırlar:** Deterministik sağlayıcı Keycloak kayıt/giriş UI'sını, realm konfigürasyonunu veya rol provisioning entegrasyonunu doğrulamaz; bunlar opt-in Keycloak E2E kapsamındadır.
- [x] Her koşuda ephemeral imza anahtarı ve test JWKS sağlayıcısı.
- [x] Buyer checkout/mock ödeme ve buyer-admin erişim sınırını doğrulayan Chromium senaryosu.
- [x] Keycloak E2E'lerin ayrı, açık opt-in akışı korunarak README ve gereksinim izlenebilirliğinin güncellenmesi.
- [x] CI kipinde Playwright E2E, web build/lint ve `git diff --check` doğrulamaları.

### Öncelik 14 — QA-020: Test sınıflandırması ve çalışma sıklığı

- **Durum:** Tamamlandı. Testler etiketlenebilir; her PR hızlı/deterministik smoke ile tam mevcut regresyon katmanlarını çalıştırır. Keycloak browser paketi gece ve elle tetiklenebilir; CI özetinde ayrı durum/test sayısı bulunur.
- **Kategoriler:** Pytest'te `smoke`, `regression`, `integration`, `security` ve PostgreSQL için `postgres` tanımlıdır; açık başka kategori almayan testler `regression`, `postgres` testleri ayrıca `integration` olur. Playwright'ta `@smoke` ve gerçek servis için `@keycloak` kullanılır. Performans ölçümleri ayrı araçlarla yapılır.
- **Çalışma sıklığı:** Her push/PR'da backend pytest regresyonu + PostgreSQL entegrasyonu + frontend Vitest coverage regresyonu + Playwright `@smoke`. Her gün 02:00 UTC'de ve `workflow_dispatch` ile aynı zorunlu kapılara ek olarak geçici Keycloak realm'inde `@keycloak` browser suite'i çalışır.
- **CI raporu/başarısızlık:** PR özetinde Keycloak adımı `skipped/optional` görünür; nightly/manual koşuda zorunludur. Test raporu ya da zorunlu job başarısızlığı workflow'u başarısız kılar; browser raporları/izleri 14 gün saklanır.
- **Gerçek Keycloak izolasyonu:** CI yalnız geçici runner ve import edilmiş test realm'i kullanır. Bootstrap admin parolası test ortamına özgü ephemeral değerdir; seller service-account secret'ı Keycloak Admin API'den koşu sırasında alınır, maskelenip yalnız job environment'a yazılır. Üretim hesabı/secret kullanılmaz.
- **Test izlenebilirliği:** `.github/workflows/ci.yml`, `apps/api/pyproject.toml`, `apps/api/tests/conftest.py`, `apps/web/package.json`, `apps/web/playwright.config.ts`, `apps/web/e2e/configure-ci-keycloak.mjs` ve `scripts/ci-summary.mjs`.
- **Yeni test standardı:** Pytest'te `smoke`/`integration`/`security` veya PostgreSQL için `postgres` gibi uygun kayıtlı marker ekle; kategori almayan testler `regression` sayılır. `keycloak` ve `performance` pytest marker'ları kaldırılmıştır. Playwright `describe` başlığına uygun `@smoke` veya `@keycloak` tag'i ekle. Vitest'te `@smoke` başlığı `npm run test:smoke` seçicisine dahildir; geri kalan Vitest paketi PR'da regresyon olarak çalışır.
- **Doğrulama:** Marker/tag selector'ları, PR smoke komutu, kapsamlı test komutu, CI raporlaması ve lint/build/regresyon kapıları doğrulanır. GitHub-hosted nightly/manual çalıştırması yerel geliştirme ortamında simüle edilemez; ilk Actions koşusunda servis entegrasyonu ayrıca gözlemlenir.

### Öncelik 15 — QA-021: Coverage kapsamının netleştirilmesi

- **Durum:** Tamamlandı. Vitest ölçümü uygulama/API, auth ve kritik UI panellerine genişletildi; giriş dosyası, test/contract dosyaları, üretilen kod ve CSS kapsam dışıdır. CI özeti ölçülen dosyaları statik bir listeden değil coverage raporundan okur.
- **Kapılar:** Genişletilmiş kapsamın toplamında statement %93, branch %88, function %95 ve line %93; her dosyada sırasıyla %81, %70, %88 ve %83. Önceki `App.tsx`, `api.ts`, `ProductCreatePage.tsx` grubunun dört ölçümde %100 kapısı korunur. Yeni `*Panel.tsx` dosyaları otomatik dahil olur.
- **Doğrulama:** 212 Vitest testi geçti; genişletilmiş kapsamda statement %93,14, branch %88,50, function %95,60, line %93,75. Eksik coverage'da yeni ve eski eşiklerin başarısızlığı ve CI raporunun kapsam/eksik rapor davranışı doğrulandı; build/lint başarılı.
- **Sınır:** Coverage çalıştırılan kodu ölçer, kapsamlı davranış doğrulaması veya gerçek tarayıcı/backend E2E yerine geçmez.

### Öncelik 16 — QA-022: API yanıt sözleşmesi doğrulaması

- **Durum:** Tamamlandı. İzole SQLite üzerinde gerçek FastAPI yanıtları sürümlü `docs/openapi.json` içindeki JSON Schema'lara doğrulanır; frontend API çağrılarının yol/yöntem/header/query/body ve üretilen modellerle uyumu CI'da zaten denetlenir.
- **Kapsam:** Kimlik, ana sayfa, ürün listeleme/oluşturma, adres listeleme/oluşturma, sepet, sipariş oluşturma/listeleme, ödeme, admin sipariş listeleme/detay ve mevcut olmayan satıcı başvurusu (`null`) yanıtları. Dinamik yol parametreleri OpenAPI şablonuna eşlenir; HTTP durum kodu, JSON content-type, required alanlar, tipler, nullable değerler, formatlar ve yerel `$ref`'ler doğrulanır.
- **Bağımlılık:** `jsonschema` yalnız backend geliştirme/test grubuna eklendi; üretim API bağımlılıklarına eklenmedi.
- **Doğrulama:** OpenAPI yanıt sözleşmesi ve snapshot testleri, frontend `contract:check`, backend Ruff ve tam pytest kapıları geçer. Geçersiz/eksik payload'ın şemadan reddedildiği negatif test de bulunur.

### Öncelik 17 — QA-023: Tarayıcıda erişilebilirlik kapsamı

- **Durum:** Tamamlandı. İzole API/JWKS ile gerçek Chromium'da dolu buyer/admin ekranları WCAG 2.1 A/AA axe taramasından geçer; kritik görünümler 320px mobil genişlikte de taşmasız doğrulanır.
- **Kapsam:** Buyer mağaza/katalog, adres defteri, dolu sepet/checkout, sipariş geçmişi; admin sipariş yönetimi ve satıcı başvuruları. PR `@smoke` Playwright işi içinde çalışır.
- **Bulgular ve düzeltmeler:** Gerçek tarayıcı taraması tablo başlıkları, kategori ve ürün açıklaması renk kontrastı ile sipariş zaman damgalarında AA kontrast ihlali buldu; metin renkleri koyulaştırıldı. 320px viewport kontrolü `body` minimum genişliğinin 360px olmasından kaynaklanan yatay taşmayı yakaladı; minimum genişlik 320px'e indirildi.
- **Sınırlar:** Axe otomatik taraması manuel ekran okuyucu, klavye deneyimi, büyütme ve tüm cihaz/browser kombinasyonlarının yerini tutmaz. Responsive kontrol seçili kritik akışlarda 320px genişliği ve yatay sayfa taşmasını doğrular.
- **Doğrulama:** `npm run test:e2e:smoke` yeni QA-023 senaryosu dahil geçer; 320px buyer/admin görünümlerinde axe ve yatay taşma kontrolleri temizdir.

### Öncelik 18 — QA-024: E2E mimarisi ve standartlaştırma

- **Durum:** Tamamlandı.
- **Standart:** API ile durum/test verisi hazırlama; cross-cutting auth ve servis yaşam döngüsü için Playwright fixture'ları; tekrar kullanılan kararlı UI bölgeleri için ince POM; iş senaryosu odaklı spec düzeni. Composer/Journey yalnızca aynı çok adımlı akış en az üç testte tekrarlandığında eklenir.
- **Uygulama alanı:** Deterministik checkout ve buyer/admin erişilebilirlik senaryolarında ortak API seed/auth fixture'ı; admin erişim, katalog CRUD, sepet ve satıcı başvurusu Keycloak akışlarında ortak login POM. Browser assertion'ları senaryolarda kaldı.
- **Test/kalite:** Smoke ve Keycloak tag'leri, senaryolar arası bağımsızlık, retry başına benzersiz veri ve per-run cleanup; deterministik senaryolar 4/4, Keycloak senaryoları 10/10 geçti.

### Öncelik 19 — REQ-016: Satıcı onayı ve marketplace yetkileri

- **Durum:** Tamamlandı. İşlev REQ-007/katalog akışında mevcuttu; seller rolü ile başvuru durumunun birlikte doğrulanması ve onay durumlarının negatif matrisi testlerle güçlendirildi.
- **Amaç:** Mevcut manuel başvuru onayının uygulama içindeki sonuçlarını açıkça tanımlamak; onaysız kullanıcıların satıcı ürünü yayımlamasını veya yönetmesini engellemek.
- **Kapsam:** Admin beyan edilen başvuruyu manuel inceler. Yalnızca Keycloak `seller` rolü ve `approved` başvuru birlikte ürün yazma yetkisi verir. Satıcı token `sub` değeriyle yalnızca kendi ürünlerini yönetir; buyer rolü/alışverişi ve admin'in mağaza geneli yönetimi etkilenmez.
- **Kapsam dışı:** KYC/KYB, resmi sicil/kimlik doğrulaması, gerçek ödeme sağlayıcısı/para hareketi, kargo entegrasyonu ve seller sipariş operasyonları (REQ-017).
- **Test/kalite:** `apps/api/tests/test_products.py` ve `tests/test_seller_applications.py` 113/113 geçti; onaysız durum matrisi, seller rolü olmadan approved başvuru, pending'e dönüşte ürün oluşturma/düzenleme/silme yasağı, rol provisioning hatası/retry ve mevcut sahiplik regresyonu doğrulandı. Ruff lint/format temiz. Gerçek Keycloak onay → yeni buyer+seller oturumu → ürün yayımlama → ortak buyer katalog görünümü E2E senaryosu REQ-007 suite'inde mevcuttur.
- [x] Kabul kriterleri ve test katmanı izlenebilirliği `docs/requirements.md` içinde tanımlandı.
- [x] Seller rolü ve başvuru durumu birlikte zorunlu; onay dışı yedi durumun ürün oluşturması reddedilir.
- [x] Seller başvurusu onay dışına alındığında var olan ürünlerini güncelleme/silme reddedilir.
- [x] Buyer-only token, approved başvuru olsa da seller ürün yetkisi kazanmaz; seller sahiplik ve ortak katalog davranışı korunur.
- [x] Backend seller/product testleri, Ruff lint ve format kapıları geçti.

### Öncelik 20 — REQ-017: Marketplace satıcı sipariş operasyonları

- **Durum:** Tamamlandı. Yerel Keycloak E2E 11/11, REQ-017 çok satıcılı senaryosu 1/1, frontend 227/227 ve etkilenen API testleri 32/32 geçti. Buyer checkout tek sipariş/ödeme, satıcı başına ayrı fulfillment olarak modellendi.
- **Amaç:** Satıcının yalnızca kendi satışlarını görüp manuel sipariş operasyonlarını yönetebildiği birden fazla satıcılı marketplace akışını kurmak.
- **Kapsam:** Tek buyer order/payment içinde satıcı bazlı fulfillment, kalem ve mağaza snapshot'ı; seller'ın kendi fulfillment'ını manuel ilerletmesi; admin gözetimi ve buyer'ın fulfillment görünümü korunur.
- **Kapsam dışı:** Gerçek kargo/taşıyıcı API'si, kargo etiketi veya takip entegrasyonu. Teslimat durumları uygulama içinde manuel/test amaçlı yönetilir.
- **Test odağı:** Satıcı sahipliği, sipariş/kalem sınırları, yetkisiz çapraz satıcı erişimi, geçerli durum geçişleri, admin görünümü ve buyer sipariş geçmişi regresyonu.

### Öncelik 21 — REQ-018: Alıcının sipariş iptali

- **Durum:** Tamamlandı. İlgili API 55/55, PostgreSQL yarış 5/5, frontend 240/240 ve deterministik E2E 1/1; build/lint ve sözleşme kontrolleri başarılı.
- **Amaç:** Alıcının kendisine ait ve iptale uygun siparişi uygulama üzerinden iptal edebilmesi.
- **Kapsam:** `pending_payment`, `paid` ve `processing` siparişleri, hiçbir paket kargolanmamışsa bütün olarak iptal edilir; isteğe bağlı neden, mock ödeme/iade kaydı, stok iadesi ve audit atomik/idempotent olmalıdır. Admin iptali, ödeme zaman aşımı ve teslimat sonrası ürün iadesi akışlarıyla çakışma ele alınır.
- **Kapsam dışı:** Gerçek para iadesi veya PSP entegrasyonu.
- **Test odağı:** Sipariş sahipliği, uygun/uygunsuz durumlar, tekrarlı/eşzamanlı istek, transaction atomikliği ve stok/ödeme/audit regresyonları.

### Öncelik 22 — Satıcı gönderimi sonrası alıcı iadesi

- **Durum:** Tamamlandı. Gerçek Keycloak seller → buyer iade E2E 1/1, backend regresyonu 310/310, PostgreSQL 20/20, frontend 241/241 ve deterministik smoke 5/5 geçti.
- **Kapsam:** Parent siparişi satıcı fulfillment geçişiyle `shipped`/`delivered` olduğunda, mevcut son durum olayından başlayan 30 günlük iade politikası API ve buyer arayüzünde çalışır. Admin geçişleri ve çok satıcılı parent durum kuralı korunur.
- **Test:** Seller → gönderim/teslim → buyer iade, geçerli ve süresi dolmuş olaylar; API, UI ve ilgili regresyonlar.

### Öncelik 23 — Ödeme expiry hata izolasyonu

- **Durum:** Tamamlandı. Backend regresyonu 310/310 (%95,26 coverage), PostgreSQL 20/20, frontend 241/241 ve deterministik smoke 5/5 geçti; build/lint başarılı.
- **Kapsam:** Stok üst sınırına takılan sipariş atomik ve görünür şekilde bekler; diğer süresi dolan siparişler kapatılır ve ilgisiz ödemeler engellenmez. Aynı sipariş için yarış/idempotency korunur; sorun çözüldüğünde sonraki taramada yeniden denenir.
- **Test:** Başarısız ve başarılı expiry kayıtlarının aynı taramada izolasyonu, ödeme API'si hata davranışı, iyileşme/tekrar ve PostgreSQL eşzamanlılık regresyonu.

### Öncelik 24 — QA-026: Performans başlangıç çizgisi

- **Durum (26 Kasım 2026):** Ölçüm çıktıları ve tekrar çalıştırma/karşılaştırma ölçütleri tamamlandı. Sayfalı sipariş geçmişi takip işi ve ortak kalite kapısı tamamlandı; güncel audit ve CI kanıtları aşağıda. Ölçümler üretim kapasitesi veya garanti edilmiş SLA değildir.
- **İlerleme:** Yedi API varyantının her biri üç izole koşuda ölçüldü; sonuçlar [baseline raporunda](./docs/performance-baseline-2026-11-14.md), çalıştırma adımları [performans notlarında](./performance/README.md). [SQL analizinde](./docs/performance-sql-analysis-2026-11-14.md) doğrulanan N+1 sorunları toplu yüklemeyle azaltıldı; 1.000 buyer siparişinde sorgu sayısı 6.001'den 13'e indi. [İyileştirme sonrası üç tekrarlı yük karşılaştırmasında](./docs/performance-load-after-sql-2026-11-15.md) buyer 10/100 ve seller profilleri her koşuda 500 ms hedefini geçti; buyer 1.000 profili üç koşuda da hedefi aştı (p95 ortancası 44,23 sn → 2,30 sn). [Frontend laboratuvarında](./docs/performance-frontend-lab-2026-11-16.md) giriş/katalog LCP ortancaları 2,78/2,90 sn, CLS ortancaları 0,01758/0,01802 olarak ölçüldü.
- **Amaç:** Katalog ve sipariş akışlarının yerel, karşılaştırılabilir başlangıç çizgisini oluşturmak; darboğazları kanıtla önceliklendirmek. Release veya canlı ortam gerekmez.
- **Sınırlar:** Yalnız izole test ortamı ve sentetik veri kullanılır. Gerçek ödeme, kargo, KYC/KYB ve üretim yük testi kapsam dışıdır. İlk çalışma PR kalite kapısı değildir; sonuçlar farklı makine/runner'lar arasında doğrudan karşılaştırılmaz.

**1. Ölçüm ortamı ve veri**

- FastAPI'yi reload kapalı, sabit worker sayısıyla; ayrı test PostgreSQL veritabanını migration uygulanmış biçimde çalıştır. Uygulama, PostgreSQL ve yük üreticisinin konumunu/kaynak sınırlarını, işletim sistemini, CPU/RAM, sürümleri, commit'i ve ilgili yapılandırmayı rapora yaz. Paylaşılan veya kalıcı geliştirme veritabanına yük uygulama.
- Tekrarlanabilir, kimliksiz sentetik veri hazırla: başlangıç için 1.000 ürün, ayrı buyer/seller hesapları ve buyer başına 10, 100 ve 1.000 siparişli ayrı veri profilleri; sipariş başına ortalama kalem ve geçmiş olay sayısını sabitleyip raporla. Seller ölçümü için onaylı seller ve ona ait siparişler de hazırlanır. Her koşu öncesi aynı başlangıç durumuna dön; hazırlık ve temizlik ölçüme dahil edilmez.
- Test kimliği/JWKS veya izole Keycloak ile gerçek API doğrulamasını koru; hangi yöntemin kullanıldığını kaydet. Giriş/token üretimi yük dışında tutulursa sonuç Keycloak giriş performansı olarak yorumlanmaz. Secret, token ve kişisel veri rapora yazılmaz.

**2. Senaryolar ve yük profili**

| Senaryo | Ölçüm kapsamı |
|---|---|
| Katalog | `GET /api/v1/products`: varsayılan sayfa ve arama/filtre/sıralama; sayfa boyutu ve sorgu parametreleri sabitlenir. |
| Buyer sipariş geçmişi | `GET /api/v1/orders`: 10, 100 ve 1.000 siparişli buyer profilleri ayrı ölçülür; bu eski endpoint sayfalanmaz. `GET /api/v1/orders/page`: 1.000 siparişli buyer'ın 20 kayıtlık ilk sayfası ayrı ölçülür. Yanıt boyutu ve sorgu sayısı da kaydedilir. |
| Seller siparişleri | `GET /api/v1/seller/orders`: onaylı seller için sabit `limit`/`offset`; buyer verisiyle karıştırılmaz. |
| Satın alma | Buyer'ın sepet okuma/ekleme → checkout → mock ödeme akışı. Her sanal kullanıcıya izole hesap, yeterli stok ve benzersiz idempotency anahtarı verilir; durum/iş sonucu doğrulanır. |

- k6 ile önce kısa doğrulama, ardından her senaryoyu ayrı koş: 1 dakika içinde 1'den 10 sanal kullanıcıya çık, 3 dakika 10 kullanıcıda kal, 30 saniyede sıfıra in. Kullanıcılar arasında 1 saniye düşünme süresi kullan; sabit VU profili sabit istek/saniye garantisi değildir. Isınma/ramp sonuçlarını sabit yük ölçümünden ayrı tut; satın alma için her iterasyon yeni sepet ve anahtar kullanır, stok tüm fazlar boyunca yeterli tutulur.
- Her veri profili için aynı ortam ve veriyle en az üç bağımsız koşu yap; tek koşu veya toplam ortalamaya dayanma. Timeout, başarısız istek ve doğrulanmayan iş sonucu gizlenmez; tamamlanan istek sayısı ve gerçekleşen throughput da raporlanır. Hiç istek/başarılı örnek üretmeyen veya yük profilini tamamlayamayan koşu geçerli baseline değildir.
- Checkout ve mock ödeme ölçümü katalogdan ayrı yorumlanır; gerçek PSP gecikmesi, gerçek kullanıcı davranışı ve dağıtık trafik bu sonuçta temsil edilmez.

**3. Metrikler ve ilk hedefler**

| Metrik | Başlangıç için önerilen ölçüt |
|---|---|
| API yanıt süresi | Sabit yük bölümünde katalog, buyer ve seller liste senaryolarının her biri için başarılı isteklerde p95 ≤ 500 ms; checkout ve mock ödeme adımlarının her biri için p95 ≤ 1.000 ms. |
| Doğruluk ve hata | Her senaryoda beklenmeyen HTTP yanıtı, timeout veya başarısız iş kontrolü oranı < %1; ayrıca durum kodu dağılımı ve iş kontrolü başarı oranı gösterilir. |
| Tanı | Her senaryoda istek sayısı, throughput, p50/p95/p99, yanıt boyutu; API/PostgreSQL CPU ve bellek gözlemleri. Sipariş listesinde profil başına SQL sorgu sayısı ve ilgili PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` çıktısı. |

Eşikler **önerilen öğrenme hedefleridir**: üç koşunun her birinde ve ilgili her veri profilinde değerlendirilir; ilk sonuç görülmeden başarılmış sayılmaz. Başarısız eşik raporda başarısız kalır; ortam kararsızlığı gözlenirse gerekçesiyle yeniden koşulur, eşik sessizce gevşetilmez. Üç koşunun bireysel sonuçları ve ortancası gösterilir; koşular arası değişkenlik yorumlanır.

**4. Analiz ve takip**

- Buyer geçmişinde sipariş sayısı arttıkça gecikme, yanıt boyutu ve sorgu sayısı büyümesini; admin/seller listelerinde mevcut sayfalama ile sorgu maliyetini incele. N+1, indeks veya sayfalama ihtiyacını ölçüm/planla doğrula. İyileştirme gerekiyorsa API sözleşmesi ve UI etkisiyle ayrı bir iş olarak planla; önce/sonra aynı profilde karşılaştır.
- Frontend için ayrı, tekrarlanabilir bir Chromium incelemesi yap: production build, sabit viewport/ağ/CPU profili ve temiz tarayıcı koşullarıyla giriş ve katalog ekranında LCP, CLS ve yüklenen JS boyutunu kaydet. Alan verisi olmadığından sonuçlar laboratuvar ölçümüdür; API yük testi veya gerçek kullanıcı deneyimiyle karıştırılmaz. İlk ölçüm sonrası anlamlı hedefler belirlenir.
- İlk baseline yerelde veya elle tetiklenen izole ortamda üretilir; CI'ya otomatik eşik kapısı ancak ortam kararlılığı ve tekrarlanabilirlik kanıtlandıktan sonra ayrı kararla eklenir.

**Çıktılar ve tamamlanma ölçütü**

- [x] Ortam, izolasyon, veri profilleri ve çalıştırma/temizlik adımları belgelenmiş; API yükü ve SQL tanısı izole PostgreSQL'i, frontend ölçümü geçici SQLite'ı kullanıyor. Kaynaklar [performans araçları ve tekrar notlarında](./performance/README.md); SQL tanısı salt okunur ve sentetik veri sayımlarını doğrular.
- [x] Katalog varyantları, üç buyer geçmiş profili, seller listesi ve satın alma senaryosu için üçer koşunun ham/özet sonuçları, gerçekleşen yük ve önerilen eşiklerin açık geçti/kaldı durumu kaydedildi. Ham arşiv ölçüm oturumunun çalışma alanındadır.
- [x] PostgreSQL sorgu sayıları, planlar, sayfalama gözlemleri ve sınırlamalar raporlandı.
- [x] Frontend laboratuvar ölçümü, gözlemler ve sınırlamalar raporlandı.
- [x] Tekrar çalıştırma araçları ve önce/sonra karşılaştırma yöntemi depoda belgelenmiş: [performans notları](./performance/README.md), [SQL tanı aracı](./performance/measure-sql.py) ve [frontend laboratuvar aracı](./performance/frontend-lab.mjs). Başarısız hedefler ve takip işleri raporlardadır; ölçüm tamamlanması, performans hedeflerinin tamamının karşılandığı anlamına gelmez.

**Takip işi — Buyer sipariş geçmişini sayfalama**

- **Durum (26 Kasım 2026):** Sayfalı endpoint, UI ve işlevsel/performance doğrulamaları tamamlandı; güncel ortak kalite kapısı da geçti. Yerel `npm audit --audit-level=low` sıfır bulgu verdi ve güncel [CI #72](https://github.com/TsuyoitteNanDesuKa/full-stack-test-proje/actions/runs/45878899594) `c554d2a` üzerinde başarılı oldu. Bu takip işi kapatıldı. Eski sınırsız liste için 1.000 siparişli buyer profilinin p95 ortancası 2,30 sn ve yanıtı yaklaşık 1 MB; 500 ms hedefi üç koşuda da aşılmıştı. Eski endpoint'in uyumluluk ve tüketici kararı QA-042'de açık kalır; bu işin kapanışı eski endpoint'in performans riskini giderdiği anlamına gelmez.
- **Kapsam ve tasarım:** Mevcut `GET /api/v1/orders` sözleşmesi uyumluluk için korunur; UI yeni `GET /api/v1/orders/page` üzerinden sınırlandırılmış sayfaları kullanır. Varsayılan limit 20, azami 100; `offset` tabanlı sonraki/önceki geçişi ve `has_more` kullanılır. Yeni siparişlerin sayfalar arasında eklenmesi offset kaymasına neden olabilir; yenileme ilk sayfaya döner. Yetki, sipariş detayları ve `created_at DESC, id DESC` sırası korunmalı. Eski endpoint sınırsız kaldığı için bu endpoint'i kullanan diğer istemciler aynı performans riskini taşır.
- **Backend ve sözleşme:** Yalnız oturum sahibinin kayıtlarını veritabanında sayfala; yalnız dönen sayfanın ilişkili verilerini yükle. Sınır/geçersiz parametreler, boş/son sayfa ve yanıtın sonraki sayfayı belirleme yöntemi için sözleşmeyi ve OpenAPI snapshot'ını güncelle.
- **Frontend:** Sipariş geçmişinde erişilebilir sayfa geçişleri, yükleme/hata/boş durumları ve iptal/iade/ödeme veya yeni sipariş sonrasında güncel veriye dönüş davranışını uygula; eski siparişlere erişimi koru.
- **Test:** Backend'de rol/sahiplik izolasyonu, sıralama eşitlikleri, sayfa sınırları ve sınırlı sorgu/yanıt; frontend'de sayfa gezintisi, son sayfa, hata/tekrar ve işlem sonrası yenileme; en az bir buyer Playwright akışında sayfa geçişi ve kritik mevcut sipariş işlemleri doğrulansın. Sözleşme, backend/frontend regresyonları ve ilgili PostgreSQL doğrulaması çalıştırılsın.
- **Performans doğrulama:** 1.000 siparişli aynı izole profilde sayfa isteğinin sorgu sayısı, yanıt boyutu ve üç bağımsız yük koşusunu ölç; 500 ms p95 hedefini her koşuda ve hata oranını ayrı raporla. Eski tam-geçmiş ölçümüyle farklı yanıt kapsamını belirt; p95 değerlerini aynı iş yüküymüş gibi karşılaştırma.
- **İlerleme:** Sayfalı backend sözleşmesi ve panelde sayfa geçişleri uygulandı; eski API korunuyor. [Üç tekrarlı ilk sayfa ölçümünde](./docs/performance-order-pagination-2026-11-16.md) p95 değerleri 73,2/54,8/28,2 ms, hata oranları %0; her koşuda 500 ms hedefi sağlandı. Bu, eski sınırsız listenin veya derin sayfaların hedefi sağladığını göstermez. PostgreSQL 17 entegrasyon paketi 22/22 geçti; sayfa sınırları, sıralama, sahiplik ve yeni sipariş eklenince offset kayması doğrulandı. Deterministik Playwright smoke 6/6 geçti; buyer senaryosu sayfa geçişleri ve ikinci sayfada ödeme/iptal/iade işlemlerini doğruladı. Bu senaryo gerçek Keycloak veya PostgreSQL tarayıcı entegrasyonunu kapsamaz.
- **Kalite kapıları (17 Kasım 2026):** Backend 322 test geçti, PostgreSQL'e ayrılmış 22 test varsayılan koşuda atlandı; coverage %95,60. PostgreSQL ayrı izole koşuda 22/22 geçti. Frontend 248/248, coverage statement %98,05/branch %91,19; build, lint, Ruff, format ve backend/frontend OpenAPI kontrolleri geçti. Backend bağımlılık taraması temiz. Frontend `npm audit --audit-level=low`, `picomatch` 4.0.7 üzerinden [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) nedeniyle 7 yüksek önem dereceli doğrudan/dolaylı paket bildirimiyle başarısız; advisory bu tarihte yama göstermiyor. Yalnız üretim bağımlılıklarıyla `npm audit --omit=dev` temiz, ancak bu CI'ın tam tarama kapısının yerine geçmez. `npm audit fix --force` kırıcı sürüm düşüşleri önerdiğinden uygulanmadı. Güvenli çözüm bulunup tarama ve ilgili kontroller tekrar geçmeden iş tamamlanmış sayılmaz.
- **Güncel güvenlik durumu (18 Kasım 2026):** [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) 15:38 UTC'de geri çekildi; GitHub advisory API'si buna rağmen `picomatch <=4.0.7` aralığını ve yamasız durumu gösteriyor. Upstream maintainer [PR #235 yorumunda](https://github.com/micromatch/picomatch/pull/235#issuecomment-6315749381) raporlanan davranışın güvenlik açığı olmadığını savunuyor. Tekrar edilen `npm audit --audit-level=low` `picomatch@4.0.7` için 7 yüksek bulguyla başarısız; `npm audit --omit=dev --audit-level=low` temiz ve `npm explain picomatch` paketin Vite/Vitest geliştirme araçlarından geldiğini doğruluyor. `npm view picomatch version` hâlâ `4.0.7` gösteriyor; `--force` Vite'ı kırıcı biçimde `6.2.7` sürümüne indirmeyi öneriyor. **Karar:** Tam audit kapısı korunacak; bu advisory için istisna, lockfile değişikliği veya kırıcı düşürme yapılmayacak. npm advisory verisi yenilendiğinde tarama yeniden çalıştırılacak.
- **Güncel doğrulama (26 Kasım 2026):** `apps/web` içindeki `npm audit --audit-level=low` sıfır bulgu verdi; CI #72'de kilitli frontend bağımlılık taraması da geçti. 17–18 Kasım'daki advisory engeli güncel ölçümde tekrarlanmadı; istisna, lockfile değişikliği veya `--force` kullanılmadı. QA-026 ortak kalite kapısı engeli bu kanıtla kaldırıldı.

### Kapanış sırası (26 Kasım 2026)

1. [x] **P0 / QA-025:** Güncel bağımlılık taraması ve CI doğrulandı; v1.0.0 release kapısı kapalı.
2. [x] **QA-026 sipariş sayfalama takibi:** Sayfalı işlev ve kalite kapısı doğrulandı; eski endpoint riski QA-042'de korunuyor.
3. [x] **QA-035 etiket gerekçeleri:** Kullanılmayan pytest marker'ları kaldırıldı; Playwright etiket kararları belgelendi.
4. [~] **QA-032 PR smoke değerlendirmesi:** Üç ardışık gece başarılı; beş gece hedefi için iki yeni gece sonucu ve PR'a ek süre kararı bekleniyor. Push/elle tetikleme yapılmayacak.
5. [ ] **P2 manuel ekran okuyucu incelemesi:** Otomasyon dışı NVDA/gerçek kullanıcı değerlendirmesi için manuel oturum gerekiyor.

### Öncelikli işler (26 Kasım 2026 itibarıyla)

1. **P0 — QA-025 güvenlik taraması uyuşmazlığı (kapandı, 26 Kasım):** Yerel `npm audit --audit-level=low` sıfır bulgu verdi ve güncel [CI #72](https://github.com/TsuyoitteNanDesuKa/full-stack-test-proje/actions/runs/45878899594) `c554d2a` üzerinde tüm zorunlu job'larla başarılı oldu; frontend audit adımı geçti. `v1.0.0` etiketi ve [release notları](./docs/release-notes-v1.0.0.md) mevcut; P0 release kontrolü `5d49644` ile kapatılmıştı. Eski `d638819`/kirli çalışma ağacı notu güncel durumu yansıtmıyordu. İstisna veya `--force` kullanılmadı.
2. **P1 — QA-027 frontend ilk yük optimizasyonu (duraklatıldı; hedefler karşılanmadı):** [20 Kasım sepet erteleme ölçümünde](./docs/performance-frontend-lab-2026-11-16.md#qa-027-kapal-sepet-panelini-etkile-ime-erteleme-20-kas-m-2026) katalog aktarımı OIDC ölçümüne göre 6.061 bayt (%1,8) azalarak 330.392 bayta indi; katalog LCP ortancası 2.872 ms ve gzip toplamı 97.012 baytla hedefleri aşmaya devam etti. Lazy-loading denemeleri sonlandırıldı; aynı türde yeni panel erteleme işi açma. QA-027 tamamlandı olarak işaretlenmeyecek; yalnız kök-neden kanıtı ve anlamlı kazanım hipotezi bulunan sınırlı bir çalışma ile yeniden değerlendirilebilir.
3. **P2 — Manuel erişilebilirlik incelemesi (otomasyonla kısmen kapatıldı; ekran okuyucu kapsam dışı):** `apps/web/e2e/accessibility.spec.ts` içine eklenen "P2 keyboard-only buyer journey" senaryosu, alıcının katalogdaki ürün bağlantısına yalnızca klavye (Tab/Enter) ile ulaşıp detay sayfasında "Sepete ekle" düğmesini klavyeyle tetiklemesini ve görünür odağı doğrular. Deterministik smoke paketi 10/10 geçti. Ekran okuyucu konuşması ve gerçek kullanıcı deneyimi otomatikleştirilemez; bunlar için manuel inceleme kalıcı sınır olarak kalır.
   - **Önceki durum (kullanıcı kararıyla ertelenmişti):** Otomatik smoke 6/6 geçti; gerçek Chrome'da giriş ekranı %200/%400 yakınlaştırmada incelendi, Tab ile giriş ve alıcı kaydı düğmelerine görünür odakla ulaşıldı; %400'de yatay taşma görülmedi ve dikey kaydırma çalıştı. Windows headed QA-023, 320 px görünümünde klasik scrollbar sonrası 305 px istemci alanında 15 px taşma buldu; `body` min-width kaldırıldı, buyer/admin reflow kontrolleri 320/305 px'e genişletildi; düzeltme sonrası smoke 6/6 ve headed QA-023 1/1 geçti. Bu oturumda buyer/admin manuel klavye veya gerçek ekran okuyucu konuşması doğrulanamadı: Chromium test penceresi uygulama başlığını gösterse de erişilebilirlik aracı sayfa içeriğini/URL'yi sunmadı; izole test oturumu temizlenerek kapatıldı. Bu kontroller yapılmış gibi raporlanmayacak; kullanıcı kararıyla P2 şimdilik atlanıyor ve açık kalıyor.
4. **P3 — Yerel v1.0 ve portföy hazırlığı (tamamlandı; `v1.0.0` etiketi yayınlandı):** Sürüm notları [docs/release-notes-v1.0.0.md](./docs/release-notes-v1.0.0.md) içinde; README sürüm bağlantısı, kapsam politikası bağlantısı ve demo komutları (`--no-access-log` dahil) backend README ile hizalandı. P2 açık kalsa da P3 kapsamı tamamlandı.
   - **Önceki durum (20 Kasım; 21 Kasım'da kapatıldı):** [Öncelik 0'daki](#öncelik-0--v10-öncesi-crud-negatif-test-kapanışı) çalışma ağacı/release notu/rapor artefaktı incelemesi ve tag öncesi kontrol açıktı. README mimari özeti, demo yolu ve N+1 vaka çalışması tamamlandı; `docs/release-notes-v1.0.0.md` oluşturulup `v1.0.0` etiketi `5d49644` ile yayınlandı. Bu eski açık durum artık geçerli değildir.
   - **İlerleme (20 Kasım; tarihsel durum):** README'ye mimari ve yerel demo özeti, N+1 vaka çalışması ve [gerçek CI koşusu #35](https://github.com/TsuyoitteNanDesuKa/full-stack-test-proje/actions/runs/44714667009) eklendi. Koşunun beş rapor artefaktı 4 Aralık'a kadar erişilebilir; koşu `dc34f87` üzerindedir ve o tarihteki `main`'in bir commit gerisindeydi. O gün release-notes dosyası henüz yoktu ve P0 tag incelemesi açıktı; bunlar 21 Kasım'da release notlarının oluşturulması ve `v1.0.0` etiketinin `5d49644` ile yayınlanmasıyla kapatıldı.
5. **P4 — QA-028: Yerel operasyonel görünürlük (tamamlandı):** Kullanıcının talebiyle P0 kapanışını beklemeden uygulandı; P0 release kapısı daha sonra kapatıldı. P2'nin otomatik kontrolleri geçti, manuel ekran okuyucu/gerçek kullanıcı incelemesi açık kaldı ve P3 yerel v1.0 sürümünü engellemedi. API liveness/readiness, veritabanı bağlantı durumunun güvenli raporlanması, ödeme expiry görevinin yaşam döngüsü ve istek korelasyonlu/hassas veri içermeyen loglar. Ayrıntılı kapsam ve doğrulama aşağıdaki QA-028 diliminde. Üretim dağıtımı veya izleme platformu kapsam dışıdır.
6. **P5 — REQ-020: Ürün detay sayfası (tamamlandı):** `GET /api/v1/products/{id}` eklendi (401/404/422 davranışı, `can_manage`), OpenAPI snapshot ve istemci sözleşmesi güncellendi; `ProductDetailPanel` yükleniyor/hata/yeniden deneme/bulunamadı/stok yok durumlarını gösterir; katalogdan detay bağlantısı, doğrudan `/products/{id}` URL'i ve geri/ileri gezinme eklendi. Backend ve web testleri geçti; deterministik Playwright senaryosu (`e2e/product-detail.spec.ts`) 3/3 geçti (`uv` kurulup Chromium yüklendikten sonra).
7. **P6 — REQ-019 e-posta doğrulama ve parola sıfırlama (tamamlandı; tarayıcı E2E geçti; parola politikası `8b7a98e` ile eklendi):** Kullanıcı kararlarıyla doğrulama zorunlu ve parola sıfırlama Keycloak `reset-credentials` akışıyla uygulandı; yerel Mailpit e-posta yakalama Compose'a eklendi. Canlı Keycloak'ta doğrulanmamış giriş reddi ve doğrulama e-postasının yakalanması kanıtlandı. [Gereksinim](./docs/requirements.md#req-019--e-posta-doğrulama-ve-parola-sıfırlama). Tarayıcıdan doğrulama, sıfırlama, yeniden kullanılan bağlantı, eşleşmeyen parola ve parola/token gizliliği E2E ile kanıtlandı. Parola politikası (en az 8 karakter, büyük/küçük harf, rakam, kullanıcı adı/e-posta olamaz) realm'e eklendi ve zayıf parola reddi E2E ile doğrulandı.
8. **P7 — Backend `main.py` kapsam açıkları (tamamlandı):** Worker'ın beklenmedik normal çıkış dalı (`else`, satır 56–57) `test_main_coverage_gaps.py` içindeki `returning_worker` testiyle kapatıldı; `main.py` kapsamı %96'ya, kaynak kapsam %96,99'a yükseldi. Kalan satırlar 97 ve 146–151 ulaşılamaz savunma dallarıdır (A sınıfı; [kapsam politikası](./docs/coverage-policy.md)). Ayrıca worker hatasının (`except` kolu) hassas veri içermeden loglandığı mevcut testlerle doğrulanır. Kabul ölçütü karşılandı: backend kapısı (`fail_under = 95`) korunur ve politika değerleri ölçümle tutarlıdır.

### Sıradaki işler — QA portföy review'u (26 Kasım 2026 güncellemesi)

Kaynak: proje ve roadmap'in QA adayı portföyü gözüyle yapılan review'u. Her madde ölçülebilir bir çıktı ile kapanır.

**Tutarlılık düzeltmeleri (önce yapılır):**

- [x] **QA-029 — Bayat "ertelendi" ifadelerinin temizlenmesi:** `docs/release-notes-v1.0.0.md` içindeki "E-posta doğrulama ve parola sıfırlama ertelenmiştir" ifadesini REQ-019 gerçek durumuyla güncelle; ROADMAP P6 satırındaki "zayıf parola politikası kararı açık" ifadesini kapat (politika `8b7a98e` ile eklendi). Kabul: iki dokümanda çelişen ifade kalmaz.
- [x] **QA-030 — Parola politikası kurulum notu:** README'ye mevcut Keycloak volume'u için realm'in yeniden içe aktarılması ya da admin API ile `passwordPolicy` uygulama adımını ekle. Kabul: politika değişikliğinin yeni ve mevcut kurulumda nasıl uygulandığı belgelenmiş olur.

**Kalite kapısı şeffaflığı:**

- [x] **QA-031 — Kalite kapısı tablosu (PR vs gece):** README'deki kalite kapısı tablosu CI job'larıyla eşleştirildi; 17 `@keycloak` testi ayrı satırlarda push/PR ve gece/elle seçimleriyle listelendi. Playwright `--list` çıktıları 17 Keycloak ve 11 smoke testini doğruladı.
- [ ] **QA-032 — REQ-019 smoke'unun PR kapısına taşınması değerlendirmesi (ölçüm sürüyor):** Doğrulama ve sıfırlama senaryolarının en az bir smoke'unun PR'da çalışıp çalışamayacağını ölç (Keycloak servisi CI'da gerekir). Kabul: karar kaydı; uygulanırsa süre ve flakiness ölçümü. Ölçüm günlük gece `keycloak-e2e` koşusundan, günde bir kez okunarak alınır; push veya manuel tetikleme yapılmaz. [24 Kasım gece koşusu #59](https://github.com/TsuyoitteNanDesuKa/full-stack-test-proje/actions/runs/45392419118) ilk başarılı ölçümdür: Keycloak job 3 dk 03 sn, test adımı 1 dk 47 sn, 17/17 geçti ve retry görünmedi. 26 Kasım itibarıyla üç ardışık gece başarılı; iki sonraki gece sonucu ve PR'a ek süre kararı açık.
  - **25 Kasım ölçümü:** [Gece koşusu #61](https://github.com/TsuyoitteNanDesuKa/full-stack-test-proje/actions/runs/45601227858), `b2a61ec` üzerinde başarılı: Keycloak job 3 dk 08 sn, test adımı 1 dk 51 sn, 17/17 geçti ve job logunda retry görünmedi.
  - **26 Kasım ölçümü:** [Gece koşusu #68](https://github.com/TsuyoitteNanDesuKa/full-stack-test-proje/actions/runs/45803922642), `d15af6a` üzerinde başarılı: Keycloak job 3 dk 01 sn, test adımı 1 dk 44 sn, 17/17 geçti ve retry görünmedi. 24–26 Kasım'da üç ardışık gece başarılıdır; beşlik hedef için iki sonraki gece sonucu ve PR'a eklenecek smoke'un ek süre ölçümü gerekir. Tam Keycloak job süresi PR'a eklenecek ek süreyle aynı kabul edilmez.

**Portföy kanıtları:**

- [x] **QA-033 — Test planı belgesi:** `docs/test-plan.md` (1–2 sayfa): kapsam ve kapsam dışı, risk matrisi (olasılık/etki), test seviyeleri, giriş/çıkış kriterleri, ortamlar, kabul ölçütleri. Kabul: her risk bir test seviyesine ve bir kanıta bağlı.
- [x] **QA-034 — Hata raporu örnekleri (BR-001 test tasarım riski, BR-002 Mailpit birikmesi, BR-003 zaman aşımı; `docs/bug-reports/`):** Gerçek bulgulardan 2–3 rapor (`docs/bug-reports/`): `App.checkout-guard` testinin yanlış varsayımı, Mailpit e-posta birikmesi, erişilebilirlik testinde bir kez görülen zaman aşımı. Her rapor: başlık, ortam, adımlar, beklenen/gerçek, kök neden, çözüm, regresyon testi. Kabul: her raporun bir regresyon kanıtı var.
- [x] **QA-035 — Regresyon ve smoke etiket gerekçeleri (`docs/test-strategy.md`; 26 Kasım'da tamamen kapatıldı):** Pytest marker'ları ve Playwright tag'lerinin hangi testi neden o etikete aldığını `docs/test-strategy.md` içinde yaz. Kullanılmayan `keycloak`/`performance` pytest marker'ları kaldırıldı; Playwright'ta ayrı `@regression`/`@security`/`@performance` etiketlerinin gerekmeme kararı gerekçelendirildi.
- [x] **QA-036 — Performans risk raporu (`docs/performance-risk-report.md`):** QA-026'daki hedef tutmayan sonuçların nedenini ve sonraki adımı tek belgede topla (başarısızlığın dürüst raporu). Kabul: her hedef için "tutuldu / tutulmadı / neden" satırı.

**Kapsam boşlukları:**

- [x] **QA-037 — Manuel erişilebilirlik inceleme planı (`docs/manual-accessibility-plan.md`; ilk NVDA koşusu henüz yapılmadı):** P2'nin manuel kısmı için ekran okuyucu (NVDA) senaryo listesi, kim/ne zaman sorumluluğu ve kayıt formatı. Kabul: plan var; uygulama tarihi roadmap'te.
- [x] **QA-038 — Erişilebilirlik flakiness kapatma (`5ce3d18`; 5 ardışık yeşil koşu):** QA-023 mobil reflow testindeki zaman aşımını kök nedene indir (yavaş admin görünümü beklemesi) ve bekleme koşulunu açık hale getir. Kabul: 5 ardışık koşuda geçer.
- [x] **QA-039 — Sözleşme testi genişletme değerlendirmesi (karar: Pact şimdi eklenmez; `docs/contract-testing-decision.md`):** Pact benzeri consumer-driven yaklaşımın bu projede gerekli olup olmadığına karar kaydı. Kabul: karar ve gerekçe `docs/`'ta.

**Bakım:**

- [x] **Comprehensive Keycloak E2E kayıt regresyonu (CI doğrulandı):** [Gece koşusu #56](https://github.com/TsuyoitteNanDesuKa/full-stack-test-proje/actions/runs/45157639315) `b6285ce` üzerinde 9 başarısız/8 başarılı testle sonuçlandı. `verifyEmail` açıkken Keycloak ilk kayıt formunda parola göstermiyordu; testler Mailpit doğrulaması ve sonraki parola ekranına uyarlandı, admin CRUD temizliği düzeltildi. Yerel iki 17/17 koşudan sonra [gece #59](https://github.com/TsuyoitteNanDesuKa/full-stack-test-proje/actions/runs/45392419118) `8209a31` üzerinde 17/17 geçti. Tek başarılı gece uzun dönem kararlılığını kanıtlamaz; QA-032 ayrıca izlenir.
- [x] **QA-040 — GitHub Actions action sürümleri:** Node.js 24 uyumlu action'larla [gece #59](https://github.com/TsuyoitteNanDesuKa/full-stack-test-proje/actions/runs/45392419118) tüm altı job'ı çalıştırdı ve başarılı oldu; altı check-run'da anotasyon ve Node 20 deprecation uyarısı yoktu. Önceki #57'de atlanan Keycloak artefaktı için oluşan anotasyon QA-041 kapsamında giderildi.
- [~] **CI Keycloak test credential log hijyeni (26 Kasım):** Workflow'daki statik admin parolası kaldırıldı; her koşuda kriptografik rastgele parola üretilip Keycloak adımlarından önce Actions maskesine kaydediliyor ve sonraki adımlara `GITHUB_ENV` ile aktarılıyor. Güncellenmiş workflow'un GitHub logunda maskelendiği, CI koşusu yayımlanınca doğrulanmalı.

**Odak sırası (güncel):** P0 kapandı ve `v1.0.0` etiketi yayınlandı (`5d49644`); P3 ve P7 tamamlandı; P2 otomasyonla kısmen kapatıldı (ekran okuyucu ve gerçek kullanıcı incelemesi manuel sınır olarak kalır). P1 (QA-027) yeni kök-neden kanıtı olmadan duraklatılmış kalır. P4, P5 ve P6 tamamlandı. QA-032 gece koşularını izlemeye devam eder; aşağıdaki uygulama dilimleri sırayla ilerler.

### Sıradaki uygulama dilimleri (25 Kasım 2026)

Bu sıra, gece ölçümü bekleyen QA-032 ile paralel ilerler. Her dilimde aşağıdaki ortak Definition of Done uygulanır; gerçek ödeme, kargo ve KYC entegrasyonları kapsam dışıdır.

1. [x] **QA-041 — CI raporunda atlanan Keycloak artefaktı:** Keycloak job'ı atlandığında indirme adımı atlanır; çalışan job'ın raporu eksikse zorunlu gece/elle kalite kapısı başarısız ve eksiklik görünür kalır. Lokal rapor testleri geçti; [push #58](https://github.com/TsuyoitteNanDesuKa/full-stack-test-proje/actions/runs/45244631122) indirme adımını atladı ve anotasyonsuz başarılı oldu, [gece #59](https://github.com/TsuyoitteNanDesuKa/full-stack-test-proje/actions/runs/45392419118) gerçek raporla başarılı tamamlandı.
2. [~] **QA-042 — Sipariş listesi ölçeklenebilirliği:** Eski sınırsız sipariş API'sinin tüketicilerini ve uyumluluk etkisini incele; veri kaybına veya sessiz kırılmaya yol açmadan sınırlandırma/geçiş planı uygula. Temiz commit üzerinde 1.000 siparişli profilde sayfalama ölçümünü üç bağımsız koşuyla tekrarla; sorgu sayısı, yanıt kapsamı/boyutu, her koşunun p95 ve hata oranını kaydet. 500 ms p95 hedefini her koşuda değerlendir ve eski tam listeyle farklı yanıt kapsamını belirt. API/UI sahiplik, sayfa sınırları ve regresyon testleri geçsin.
   - **Geçiş:** Uygulama sipariş paneli zaten sayfalı API'yi kullanıyor; kaynak taramasında eski GET frontend çalışma zamanı tüketicisi bulunmadı, yalnız backend/response uyumluluk testleri ve performans tanıları kaldı. Harici tüketiciler bilinmiyor. Eski GET, tam dizi davranışı korunarak OpenAPI ve HTTP başlıklarında deprecated işaretlendi; yeni istemciler `/api/v1/orders/page` kullanmalı. Kaldırma/sınırlama kararı için tüketici geçişi ve ayrı sürüm duyurusu gerekir; tarih belirlenmedi. Bu adım eski endpoint'in sınırsız maliyetini çözmez.
   - **Tüketici envanteri ve karar hazırlığı (25 Kasım):** `OrderHistoryPanel` sayfalı `getMyOrdersPage` kullanıyor; `api.ts` içindeki deprecated `getMyOrders` yardımcısı korunuyor ve depo içindeki diğer kullanımları test/uyumluluk kapsamındadır. Eski GET backend sözleşme testleri ve performans tanılarında da kullanılır; aynı yolun POST checkout kullanımı bu geçişten bağımsızdır. Projenin belgelenen kapsamı yereldir; [QA-039 karar belgesi](./docs/contract-testing-decision.md) dış tüketici yokluğu yerine yalnızca depoda bilinen kapsamı belirtir. Depo taraması dış istemci yokluğunu kanıtlamaz. Geçiş sorumlusu, dış tüketiciler ve kullanım durumu teyit edilmeden kaldırma tarihi belirlenmez; eski GET dizi yanıtı ve davranışı korunur.
   - **Kapanış için sonraki adımlar:** API sahibi ve dağıtım/entegrasyon sahipleri envanteri doğrulasın; varsa her dış istemci sayfalı yanıtın `items`/`has_more` ve `limit`/`offset` sözleşmesine geçirilsin, tüm geçmişe erişim ve offset kayması sınırı doğrulansın. Ardından ayrı sürüm duyurusu ve geçiş süresi kararlaştırılsın; tüketici onayı ve uygun regresyon kanıtı olmadan eski GET sınırlandırılmasın veya kaldırılmasın. Sahip ve dış tüketici durumu henüz atanmış/doğrulanmış değildir.
   - **Ölçüm:** Temiz `e5e480c` commit'inde üç bağımsız ilk-sayfa koşusunda p95 33,29/31,01/32,13 ms ve hata oranı her birinde %0; ayrı tanıda 7 sorgu ve 20.729 bayt. [Yöntem ve sınırlar](./docs/performance-order-pagination-2026-11-16.md#qa-042--temiz-commit-üzerinde-tekrar-23-kasım-2026). Eski tam listeyle farklı yanıt kapsamları karşılaştırılmaz.
   - **Tekrar (25 Kasım):** Performans SQL aracı ilk sayfalı endpoint'i de sorgu/yanıt boyutu tanısına dahil etti. Temiz `d970b05` commit'inde üç bağımsız koşunun p95'i 30,53/38,37/28,31 ms; hata oranı her birinde %0 ve yanıt p50 20.729 bayt. SQL tanısı sayfalı 20 öğe için 7 sorgu/20.729 bayt, eski 1.000 kayıtlık tam liste için 13 sorgu/1.030.665 bayt buldu. Tam tablo ve farklı yanıt kapsamı uyarısı [performans raporunda](./docs/performance-order-pagination-2026-11-16.md#qa-042--temiz-güncel-commit-üzerinde-tekrar-25-kasım-2026).
   - **Doğrulama:** Backend sipariş/sözleşme testleri 23/23, izole PostgreSQL sayfalama/sahiplik testleri 2/2, frontend sipariş/API testleri 93/93 ve deterministik sipariş sayfalama E2E 1/1 geçti; Ruff, frontend lint/build ve iki OpenAPI kontrolü geçti. 25 Kasım tekrarında üç sayfalı yük koşusu ve SQL tanısı da doğrulandı. 26 Kasım odaklı tekrarında legacy/sayfalama API testleri 8/8, frontend `OrderHistoryPanel`/API testleri 49/49 geçti; eski GET tam dizi yanıtını ve `Deprecation`/`Link` sinyallerini koruyor, uygulama paneli sayfalı ucu kullanıyor. Dış tüketici envanteri/sürüm geçişi bilinmediği için eski uç noktanın sonlandırılması veya sınırlandırılması kararı hâlâ açık; madde kapatılmadı.
3. [x] **QA-043 — Satıcı liste sorgusu analizi:** Temiz `8209a31` commit'inde üç bağımsız koşu p95 24,86/23,03/25,69 ms, her birinde %0 hata ile 500 ms hedefini sağladı. Mevcut toplu yükleme limit 50 için 5 sorgu; geçmiş ölçümde toplu yükleme öncesi 103 sorgu vardı. Geçici birleşik indeks tekil plan testinde seçildi, ancak HTTP p95 kazancı ve farklı veri dağılımları ölçülmedi; bu nedenle migration eklenmedi. [SQL analizi](./docs/performance-sql-analysis-2026-11-14.md#qa-043--satıcı-sorgusu-ve-indeks-değerlendirmesi-24-kasım-2026), [yük sonuçları](./docs/performance-load-after-sql-2026-11-15.md#qa-043--satıcı-yükünün-temiz-commit-tekrarı-24-kasım-2026).
4. [x] **REQ-021 — Alıcı favorileri:** [Gereksinim](./docs/requirements.md#req-021--alıcı-favorileri) ve kabul kriterleri tanımlandı; buyer'a özel, idempotent ekleme/çıkarma ve sayfalı liste, veritabanı migration'ı ve ürün detayı/favori paneli uygulandı. Silinen ürünün kayıtları cascade ile kaldırılır; eşzamanlı ekleme tek kayıt üretir.
   - **Doğrulama:** Backend coverage regresyonu 415 geçti, 23 PostgreSQL testi ayrı ortam gerektirdiği için atlandı; coverage %96,82. PostgreSQL 17 izole paket 23/23, sonradan eklenen ürün silme yarışı dahil odaklı favori testleri 2/2 geçti. Ek backend favori/migration/sözleşme testleri 19/19, frontend coverage 320/320, deterministik browser smoke 12/12 geçti. Ruff, frontend lint/build ve OpenAPI kontrolleri geçti.
5. [x] **REQ-022 — Ürün değerlendirmeleri:** [Gereksinim ve kabul kriterleri](./docs/requirements.md#req-022--ürün-değerlendirmeleri) yazıldı; teslim edilen pakete bağlı buyer değerlendirmesi, kullanıcı başına tek kayıt, düzenleme/silme, anonim sayfalı liste, migration ve ürün detayında UI uygulandı. İade ve satıcı değişikliği değerlendirmeyi kaldırmaz; yorumun Unicode uzunluğu, rol/sahiplik ve eşzamanlı oluşturma sınırları doğrulandı.
   - **Doğrulama:** Backend coverage 435 geçti, 26 PostgreSQL testi ayrı ortam gerektirdiği için atlandı; coverage %97,07. İzole PostgreSQL 17 paketi 26/26, frontend coverage 334/334, deterministik browser smoke 13/13 ve genişletilmiş yetki/teslim/erişilebilirlik E2E senaryosu 1/1 geçti. Ruff, frontend lint/build ve OpenAPI kontrolleri geçti. Ön yüz coverage ilk eşzamanlı ağır koşuda zaman aşımına uğradı; tek başına iki tekrar başarılı oldu.

   **REQ-023 — İptal edilen siparişten sepete ekleme (tamamlandı):** [Gereksinim ve kabul kriterleri](./docs/requirements.md#req-023--iptal-edilen-siparişten-sepete-ekleme) tanımlandı. Mevcut sepet, güncel fiyat/stok ve kısmi/sonucu belirsiz hata durumları korunur; eski sipariş veya ödeme yeniden açılmaz. İşlem kalem bazındadır; belirsiz sonuç otomatik yeniden gönderilmez ve koruma sayfa ömrüyle sınırlıdır.
   - **Doğrulama:** Backend 438 geçti, PostgreSQL gerektiren 26 test atlandı; frontend coverage 365/365 ve tüm eşikler geçti. Deterministik tarayıcı smoke 14/14; yeni senaryo mevcut sepetle birleşme, güncel fiyat, silinmiş ürün ve stok yetersizliğini doğruladı. Frontend lint/build ve Ruff başarılı.

6. [~] **QA-044 — DAST başlangıç uygulaması:** Kullanıcının talebiyle QA-042'nin dış tüketici kararı beklenmeden pasif pilot uygulandı; QA-042 açık kalır. Ayrı gece/elle workflow, yalnız geçici API/web/SQLite hedeflerini `--internal` Docker ağında OWASP ZAP Baseline ve OpenAPI GET-only güvenli modla tarar. Bulgular raporlanır; ortam/tarayıcı hataları başarısız olur, HTML/JSON raporları 14 gün artefakt olarak saklanır. Üretim veya harici hedef, gerçek kullanıcı verisi/kimlik bilgisi ve aktif tarama kapsam dışıdır.
   - **Yerel pilot (25 Kasım):** ZAP 2.17.0 web'de 7 URL ve 5 uyarı, API'de 32 URL ve bir bilgilendirme üretti. Web uyarıları CSP, anti-clickjacking, `X-Content-Type-Options`, sunucu sürüm başlığı ve SPA keşif sınırıdır; başlıklar geçici Python statik sunucusuna aittir ve üretime genellenmez. API bilgilendirmesi anonim isteklerde beklenen `401` yanıtlarını içerir. Bunlar incelenmesi gereken bulgulardır; güvenlik açığı yokluğu kanıtlanmadı.
   - **İlk uzak koşu (26 Kasım):** Planlı DAST #1, `d15af6a` üzerinde başarılı; safety testleri, pasif web/API taraması ve 14 günlük `dast-reports` artefakt yüklemesi geçti. [Koşu ve raporlar](https://github.com/TsuyoitteNanDesuKa/full-stack-test-proje/actions/runs/45808626516). Web raporunda 5 alert türü var: CSP (Medium/High, 2 instance), anti-clickjacking (Medium/Medium, 1), `Server` sürüm bilgisi (Low/High, 5; geçici `SimpleHTTP/0.6 Python/3.13.18`), `X-Content-Type-Options` (Low/Medium, 4) ve modern SPA bilgilendirmesi (Informational, 1). Başlık uyarıları geçici Python statik sunucuya aittir, üretim web sunucusu hakkında kanıt değildir. Anonim API raporu 19 GET URL'sinde 18 adet beklenen `401`, mock-checkout GET'te `404` üretti; işlevsel doğrulama sağlamadığı için ikinci aşamayı gerekçelendirdi.
   - **Kimlikli tarama prototipi (26 Kasım, yerel):** DAST hedef container'ında koşu başına RSA/JWKS ve 10 dakikalık sentetik buyer JWT'si oluşturuluyor. `/api/v1/auth/me` ön kontrolü buyer rolünü doğruluyor. ZAP hook token'ı yalnız özel geçici dosyadan alıyor ve Bearer başlığını yalnız yedi allowlist yolundaki GET isteklerine ekliyor; token komut satırına, loga veya rapor artefaktına yazılmıyor. Auth OpenAPI'si yedi buyer GET yolu ile sınırlı; admin/seller ve mutation işlemleri yok, `-S` aktif taramayı atlıyor. İlk prototipte `/products` parametreleri boş `min_price`/`max_price` nedeniyle `422` üretti; scan-only şemadan bu iki opsiyonel parametre çıkarılınca son yerel koşuda 7 URL %100 2xx oldu ve 4xx/5xx görülmedi. Tek bulgu `X-Content-Type-Options` eksikliğidir (Low/Medium, 5 instance); bu başlık geçici API sunucusuna aittir ve üretime genellenmez. Birim testleri 12/12, Ruff ve gerçek Docker/ZAP uçtan uca koşusu geçti. `5fae7fb` ile `main`'e yayımlandı; [push CI #69](https://github.com/TsuyoitteNanDesuKa/full-stack-test-proje/actions/runs/45877680706) başarılı. Uzak DAST workflow doğrulaması henüz yapılmadı.
   - **Kabul ve kalite kapısı:** Tarama tekrarlanabilir CI adımıdır; yalnız tanımlı yerel test hedeflerini tarar, rapor üretir ve artefaktı saklar. İlk bulgular doğrulanıp yanlış pozitifler kayda alınır; yalnız doğrulanmış bulgular için kapsamı ve sona erme tarihi belli istisna/başarısızlık politikası kararlaştırılır. DAST mevcut rol/sahiplik API testlerinin, SCA taramalarının veya manuel güvenlik incelemesinin yerine geçmez. `docs/test-plan.md` güncellenir.

### P4 — QA-028: Yerel operasyonel görünürlük

- **Durum:** Tamamlandı; P0 kapanışını beklemeden kullanıcı talebiyle uygulandı. P0 release kapısı 21 Kasım'da kapatıldı; P2'nin otomatik kontrolleri geçti ve manuel erişilebilirlik incelemesi açık olsa da yerel v1.0 sürümünü engellemedi.
- **Öğren:** Liveness/readiness ayrımı, uygulama yaşam döngüsü, arka plan görevi teşhisi, güvenli loglama ve operasyon odaklı test tasarımı.
- **Kapsam:** API için sır/kişisel veri döndürmeyen liveness ve readiness uçları; readiness için veritabanı erişiminin güvenli kontrolü; `payment_expiry_worker` başlatma, hata ve kapanış durumunun gözlemlenebilirliği; istekleri loglarla ilişkilendirecek korelasyon kimliği.
- **Test:** Sağlıklı ve veritabanı erişilemeyen readiness; worker başlatma/kapatma ve hata durumu; korelasyon kimliğinin istekten log bağlamına taşınması; loglarda token, parola veya kişisel veri bulunmaması.
- **Kapsam dışı:** Üretim dağıtımı, Prometheus/Grafana veya harici APM kurulumu; yalnızca bu madde için servis/mikroservis ayrıştırması.
- **Çıkış ölçütü:** Yerel çalıştırma ve hata senaryoları belgeli; health/readiness ve worker yaşam döngüsü testlerle doğrulanmış; dış bağımlılık hataları başarı gibi raporlanmıyor.
- **Sonuç ve doğrulama:** Liveness/readiness uçları, DB `SELECT 1` kontrolü, worker durumunun readiness'e yansıtılması ve üretilen `X-Request-ID` ile hassas içerik taşımayan istek logları eklendi. Uygulama, JWKS ve Keycloak provisioning hata logları hata mesajı/URL yazmayacak şekilde daraltıldı; yerel Uvicorn örneğinde URL/query access logları kapatıldı. Backend: 330 geçti, 22 PostgreSQL testi ayrılmış DB ayarı olmadığı için atlandı; Ruff lint/format ve `git diff --check` geçti. Sağlıklı/başarısız readiness, liveness, worker yaşam döngüsü/hatası, korelasyon ve log hijyeni test edildi.

### P5 — REQ-020: Alıcı ürün detay sayfası

- **Durum:** Tamamlandı; uygulama ve doğrulama yukarıdaki Öncelik 6 kaydında ve [REQ-020 gereksiniminde](./docs/requirements.md#req-020--alıcı-ürün-detay-sayfası) belgelenmiştir.
- **Kullanıcı hikâyesi:** Alıcı olarak katalogdaki bir ürünü açıp fiyat/stok bilgisini ve sepete ekleme sonucunu görmek istiyorum; böylece satın alma kararını ürün bazında verebilirim.
- **Backend ve sözleşme:** Kimliği doğrulanmış kullanıcılar için `GET /api/v1/products/{product_id}` ekle; bulunmayan/silinmiş ürün `404` döndürsün. Yönetim yetkisi bilgisi mevcut owner/admin kurallarıyla tutarlı kalsın; OpenAPI snapshot ve istemci sözleşme kontrolleri güncellensin.
- **Frontend:** Katalogdan detay sayfasına erişim; yükleniyor, API hatası, bulunamayan ürün ve stokta olmayan ürün durumları; güncel fiyat/stok; buyer'ın ürünü sepete eklemesi ve mevcut sepet davranışını koruması.
- **Test:** Backend auth/404/ürün yanıtı; frontend yükleme/hata/boş stok ve tekrar deneme durumları; Playwright'ta katalog → detay → sepete ekleme akışı. Yeni uç nokta ve UI davranışları uygun API/component/E2E seviyelerinde doğrulansın.
- **Kapsam dışı:** Ürün görseli yükleme/depolama, varyantlar, puan/yorum, kampanya ve gerçek ödeme/kargo entegrasyonu. Gerekirse ilk sürümde sabit yerel placeholder görsel kullan.
- **Çıkış ölçütü:** Ürün detay akışı erişilebilir, doğrudan URL ve katalog navigasyonuyla çalışır; fiyat/stok ve sepet sonucu tutarlıdır; sözleşme ve ilgili kalite kapıları geçer.

### Her incremental dilim için ortak Definition of Done

1. Gereksinim ve kabul kriterleri pozitif, negatif, sınır ve rol/erişim koşullarını içerir.
2. Veri modeli ve API sözleşmesi migration ve uyumluluk etkisiyle birlikte incelenir.
3. Geliştirme tamamlanır tamamlanmaz ilgili testler aynı dilimde yazılır: iş kuralları unit; endpoint/rol/validasyon API; kalıcılık migration/DB entegrasyon; UI durumları component; kullanıcı açısından kritik ve rol sınırlarını kapsayan yollar Playwright E2E.
4. Her geliştirme maddesinin altında bu katmanlara ait somut test senaryoları ve beklenen sonuçlar ROADMAP/gereksinim belgesinde yer alır; “sonra test edilir” şeklinde kapsam dışına atılamaz.
5. Hata, yeniden deneme, idempotency, eşzamanlılık, yetkisiz erişim ve güvenlik sınırları riskine uygun negatif test edilir.
6. Yeni kullanıcı/rol kullanan E2E dilimlerinde izole test realm'i, güvenli ve tekrarlanabilir test hesabı/rol hazırlığı ile temizlik stratejisi önceden planlanır; üretim hesabı/credential kullanılmaz.
7. Test, lint, type-check/build, coverage ve E2E kalite kapıları geçer; gereksinim-test izlenebilirliği ve roadmap durumu güncellenir. Bu kapı geçmeden sonraki özelliğe başlanmaz.

## Teknoloji öğrenme sırası

1. Git, terminal, HTTP ve temel SQL.
2. Python temelleri, sanal ortam/bağımlılık yönetimi (`uv`, `pyproject.toml`) ve Ruff.
3. Test tasarımı teknikleri ve pytest ile unit test.
4. FastAPI, Pydantic ve HTTPX/TestClient ile REST API testi.
5. PostgreSQL, SQLAlchemy, Alembic ve veritabanı entegrasyon testi.
6. TypeScript/Node.js/npm, React ve React Testing Library ile istemci/component testleri.
7. Docker Compose ile tekrarlanabilir test ortamı.
8. Playwright ile sistem/E2E testi.
9. GitHub Actions ile CI.
10. OpenAPI sözleşme kontrolleri; Keycloak/OIDC kimlik entegrasyonu; sonrasında erişilebilirlik, güvenlik ve performans araçları.

## Öğrenme günlüğü ve ilerleme takibi

Her aşama için aşağıdaki kısa notları tutun:

- Ne öğrendim, hangi kararı neden verdim?
- Hangi risk/test fikri işe yaradı; hangi açık kaldı?
- Hangi test seviyesi bu kontrol için uygundu, neden?
- Bir sonraki aşamaya geçiş ölçütleri karşılandı mı?
- Başarısız veya flaky testin kök nedeni neydi?

İlerlemeyi tamamlanan teknoloji sayısıyla değil, test edilebilir özellikleri ne kadar güvenilir biçimde tasarlayıp doğruladığınızla ölçün.
