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
10. OpenAPI sözleşme kontrolleri; sonrasında erişilebilirlik, güvenlik ve performans araçları.

## Öğrenme günlüğü ve ilerleme takibi

Her aşama için aşağıdaki kısa notları tutun:

- Ne öğrendim, hangi kararı neden verdim?
- Hangi risk/test fikri işe yaradı; hangi açık kaldı?
- Hangi test seviyesi bu kontrol için uygundu, neden?
- Bir sonraki aşamaya geçiş ölçütleri karşılandı mı?
- Başarısız veya flaky testin kök nedeni neydi?

İlerlemeyi tamamlanan teknoloji sayısıyla değil, test edilebilir özellikleri ne kadar güvenilir biçimde tasarlayıp doğruladığınızla ölçün.
