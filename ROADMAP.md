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
- [ ] Tag öncesi çalışma ağacı ve release notları incelenmeli; test/build raporları üretilen artefakt olarak saklanmalı.

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
- İlk sürümde yalnızca beyan bilgileri admin tarafından manuel incelenir; belge dosyası, T.C. kimlik/vergi numarası, banka bilgisi ve tam adres toplanmaz. Bu karar formal KYC veya mevzuata uygunluk teyidi değildir; ilan/payout/satışa başlama daha sonraki doğrulanmış gereksinime bağlıdır.
- Otomatik KYC/KYB bu dilime dahil değildir. Daha sonra yetkili resmî servis veya sözleşmeli sağlayıcı araştırması yapılacak: MERSİS/Ticaret Sicili, GİB ve kimlik doğrulama seçeneklerinin gerçekten erişilebilirliği/entegrasyon hakkı, ülke kapsamı, KVKK, maliyet ve manuel incelemeye dönüş yolu doğrulanmadan teknoloji seçilmeyecek.
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

**Çıkış ölçütü:** Başvuru ve admin kararları izlenebilir; Keycloak rol provisioning hataları başarı gibi gösterilmez; onaysız kullanıcı seller yetkisi kazanamaz. Bu dilim formal KYC/satış uygunluğu veya ödeme kabulü sağlamaz.

### Öncelik 3 — REQ-008: Admin rolü atama ve yönetici erişimi

**Başlama koşulu:** REQ-007 satıcı başvurusu/işletme doğrulaması ve test kapısı tamamlanmış olmalı.

**Amaç:** Platform yöneticisi rolü yalnızca yetkili ve denetlenebilir bir yönetim süreciyle atanabilsin; uygulama kullanıcısı kendi yetkisini yükseltemesin.

- Güvenilir ilk admin bootstrap yöntemi ve sonrasındaki admin atama/geri alma workflow'unu ayrı gereksinimle tanımla.
- Admin rolü self-registration, profil düzenleme, istemci isteği veya satıcı başvuru onayıyla kendiliğinden verilememeli.
- Yetkili atama yapan aktör, hedef kullanıcı, rol değişikliği, zaman ve sonuç audit kaydına alınmalı.
- Backend, tüm admin işlemlerinde Keycloak role claim'ini doğrulamaya devam etmeli.

**Geliştirme tamamlandıktan hemen sonra — test geliştirme planı:**

- **Unit:** Atama/geri alma iş kuralları, rol sınırları, son aktif admin koruması ve audit olaylarının oluşturulması.
- **API/entegrasyon:** Güvenilir admin atama/geri alma endpoint veya servis sözleşmesi; alıcının/satıcının rol atayamaması; sahte/eksik hedef, yetkisiz çağrı ve IdP hata yanıtlarında güvenli davranış.
- **Keycloak entegrasyon:** İzole test realm'inde yalnızca güvenilir yönetim kanalının rol atayabildiği, kaldırabildiği ve token yenilendiğinde claim'in güncellendiği doğrulanmalı. Test admin hesabı otomatik ve tekrarlanabilir biçimde yalnızca test ortamında hazırlanmalı; sabit/üretim credential'ı kullanılmamalı.
- **Component:** Admin kullanıcı/rol yönetim ekranında onay, hata, yükleme ve başarılı atama/geri alma görünümü; ayrıcalıksız kullanıcıya yönetim eylemi gösterilmemesi.
- **E2E/regresyon:** Admin atama ve geri alma tarayıcıdan gerçek Keycloak/API ile doğrulanmalı. Aynı test diliminde önceki CRUD kapsamı geri eklenerek admin'in ürün ekleme, düzenleme ve silmesi; buyer'ın bu eylemleri görememesi ve API'de `403` alması uçtan uca doğrulanmalı.
- **Güvenlik/audit:** Yetki yükseltme denemeleri, son admin'in kaldırılması, audit kaydının aktör/hedef/zaman/sonuç bilgisi ve sırların loglara yazılmaması.

**Çıkış ölçütü:** Admin yetkisi yalnızca güvenilir iş akışından verilir/alınır; her değişiklik denetlenebilir ve API'de etkili olur.

### Öncelik 4 — REQ-009: Müşteri sepeti

**Amaç:** Giriş yapmış müşteri ürünleri sepete ekleyebilsin, miktarı değiştirebilsin ve sepetten çıkarabilsin.

- Ürün ve miktarı içeren kullanıcıya ait sepet/kalem modeli; miktar pozitif tam sayı olmalı.
- Sepete ekleme, güncelleme ve silme API'leri; kullanıcı yalnızca kendi sepetini değiştirebilmeli.
- Ürün bulunamama, sıfır/negatif/kesirli miktar, stok sınırını aşma, başka kullanıcının sepetine erişme ve eşzamanlı stok değişimi negatif koşulları tanımlanmalı.
- UI'da sepet özeti ve boş/yükleniyor/hata durumları; katalogdan sepete ekleme ile miktar ve kaldırma akışı.

**Geliştirme tamamlandıktan hemen sonra — test geliştirme planı:**

- **Unit:** Miktar, stok, fiyat/özet hesapları ve sepet iş kuralları; sınır değerleri.
- **API/entegrasyon:** Ekle/güncelle/sil/listele; anonim erişim; başka kullanıcının sepeti; bulunmayan/silinmiş ürün; invalid miktar; duplicate kalem ve stok değişimi.
- **DB/migration:** Kullanıcı-sepet-ürün ilişkileri, kısıtlar, migration upgrade/downgrade, transaction ve eşzamanlı güncellemeler.
- **Component:** Katalogdan ekleme, sepet özeti, miktar güncelleme/kaldırma, boş/yükleniyor/hata ve API yanıtlarının UI'ya yansıması.
- **E2E:** Buyer'ın gerçek akışta ürünü sepete ekleyip değiştirmesi/kaldırması; başka kullanıcı verisinin görünmemesi ve kritik yolun yenileme sonrası tutarlılığı.

**Çıkış ölçütü:** Müşteri kendi sepetini güvenilir biçimde düzenler; hatalı veya yetkisiz değişiklikler kalıcılaşmaz; stok ve miktar kuralları backend'de atomik olarak korunur.

### Öncelik 5 — REQ-010: Sipariş oluşturma

**Amaç:** Müşteri sepetini doğrulayarak siparişe dönüştürebilsin; sipariş geçmişi satın alma anındaki ürün/fiyat bilgisini korusun.

- Sipariş ve sipariş kalemleri; ürün adı/fiyat/adet gibi satın alma anındaki değerlerin snapshot'ı, toplam tutar ve açık sipariş durumları.
- Checkout öncesi sepet, stok ve fiyat doğrulaması; sipariş ve stok güncellemesi tek transaction içinde yapılmalı.
- Boş sepet, silinmiş ürün, yetersiz/değişmiş stok, istemcinin değiştirdiği fiyat/toplam, yinelenen gönderim ve transaction hatası negatif koşulları.
- Sipariş onay özeti ve sipariş geçmişi; yükleniyor/başarı/hata durumları.

**Geliştirme tamamlandıktan hemen sonra — test geliştirme planı:**

- **Unit:** Tutar/snapshot hesaplama, sipariş durum makinesi, stok ve checkout iş kuralları; yuvarlama ve sınır değerleri.
- **API/entegrasyon:** Başarılı checkout ve tüm negatif koşullar; istemciden gelen fiyat/toplamı reddetme; idempotency; hatada stok/sepet/siparişin değişmemesi.
- **DB/transaction:** Sipariş, kalem snapshot'ı ve stok güncellemesi atomikliği; rollback; migration ve ilişkisel kısıtlar.
- **Component:** Onay özeti, submit tekrarını önleme, başarı ekranı, validation/API/bağlantı hataları.
- **E2E:** Buyer sepetten sipariş verir, geçmişte siparişi görür; ürün sonradan güncellense/silinse snapshot korunur; tekrar gönderim ikinci sipariş oluşturmaz.

**Çıkış ölçütü:** Sipariş ya tüm kalemleriyle ve stok etkisiyle oluşur ya da hiçbir değişiklik kalıcılaşmaz; sipariş tutarı istemci girdisine güvenmez ve daha sonra ürün değişse/silinse bile geçmiş tutar korunur.

### Öncelik 6 — REQ-011: Ödeme entegrasyonu

**Amaç:** Sipariş, gerçek kart verisini uygulama sunucusuna almadan güvenilir bir ödeme sağlayıcısı üzerinden ödenebilsin.

- Önce sağlayıcıdan bağımsız ödeme arayüzü ve sağlayıcının sandbox/hosted checkout akışı; kart numarası veya güvenlik kodu uygulama veritabanı/loglarında tutulmamalı.
- Ödeme başlatma, beklemede/başarılı/başarısız durumları ve kullanıcıya sonuç ekranı; sipariş ve ödeme durum geçişleri açıkça tanımlanmalı.
- İmzalı webhook doğrulaması, idempotency, tekrar/ters sıra/bozuk webhook, zaman aşımı, sağlayıcı hatası, iptal ve tutar uyuşmazlığı senaryoları.

**Geliştirme tamamlandıktan hemen sonra — test geliştirme planı:**

- **Unit:** Ödeme/sipariş durum geçişleri, imza doğrulama, idempotency ve tutar eşleştirme kuralları.
- **Adapter contract/entegrasyon:** Sağlayıcı sandbox sözleşmesi, başarı/ret/zaman aşımı/bozuk yanıt; imzasız, bozuk, tekrarlı ve sıra dışı webhook; sağlayıcı hatasında state tutarlılığı.
- **API/DB:** Ödeme başlatma yetkisi ve sahiplik, idempotency, transaction sınırları, webhook tekrarında tek durum geçişi; kart verisinin DB/log/yanıt içinde bulunmadığı doğrulanmalı.
- **Component:** Hosted checkout'a yönlendirme, beklemede/başarılı/başarısız/iptal ekranları ve tekrar deneme durumları.
- **E2E:** Sandbox/hosted checkout ile baştan sona ödeme ve webhook sonucu; yalnızca sentetik sandbox bilgileri kullanılmalı, gerçek kart verisi kullanılmamalı.
- **Güvenlik/regresyon:** Webhook imzası atlatılamamalı; farklı sipariş/kullanıcıya ait ödeme güncellenememeli; önceki checkout akışı korunmalı.

**Çıkış ölçütü:** Yinelenen veya doğrulanmamış bildirim ikinci kez tahsilat/sipariş geçişi yaratmaz; uygulama, sağlayıcı sonucu kesinleşene kadar siparişi tutarlı bir bekleme durumunda gösterir.

### Öncelik 7 — REQ-012: Sipariş takibi ve operasyonel tamamlayıcılar

- Müşteri sipariş geçmişi ve durum ayrıntıları; admin sipariş işleme yetkileri ayrı gereksinimle tanımlanmalı.
- İptal, iade ve geri ödeme politikaları; stok iadesi ve ödeme sağlayıcı durumlarıyla transaction/idempotency kuralları belirlenmeli.

**Geliştirme tamamlandıktan hemen sonra — test geliştirme planı:**

- **Unit:** İzin verilen sipariş/ödeme geçişleri, iptal/iade/geri ödeme ve stok iadesi iş kuralları.
- **API/entegrasyon/DB:** Müşteri sahipliği, admin işlem yetkisi, idempotency, audit, transaction/rollback, sağlayıcıyla tutarlı durum ve hata kurtarma.
- **Component:** Müşteri/admin durum görünümleri, işlem onayları, beklemede/hata ve erişilebilirlik davranışları.
- **E2E:** Müşterinin sipariş takibi; yetkili admin operasyonu; yetkisiz kullanıcı değişikliği reddi; iptal/iade gibi kritik yaşam döngüsü akışları.
- **Kalite/regresyon:** Audit bütünlüğü, erişilebilirlik ve risk bazlı performans ölçümleri; önceki sipariş/ödeme akışlarının regresyonları.

**Çıkış ölçütü:** Sipariş/ödeme yaşam döngüsü izlenebilir; her durum değişimi yetkili, tekrara dayanıklı ve müşteri/admin görünümünde tutarlıdır.

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
