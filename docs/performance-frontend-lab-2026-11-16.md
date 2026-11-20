# QA-026 — Frontend laboratuvar ölçümü

## Kapsam ve ortam

16 Kasım 2026'da React/Vite production build ile iki ekran üçer kez, yeni ve boş Chromium context'inde ölçüldü:

- **Giriş:** oturumu olmayan kullanıcının uygulamadaki giriş ekranı. Keycloak'a yönlendirme veya Keycloak'ın kendi giriş ekranı ölçülmedi.
- **Katalog:** sayfa yüklenmeden test buyer oturumu hazırlanmış, gerçek API ile 20 sentetik ürünün gösterildiği ekran. Giriş işlemi, Keycloak ve ürün oluşturma ölçüm dışındadır.

Commit `d2075a9ac64dfe09cf04f45685b405491d669c50`, ölçüm başlangıcında çalışma ağacı temizdi. Windows 11 Education 10.0.26200; Intel i5-10300H (4 çekirdek / 8 mantıksal işlemci), 15,84 GiB RAM; Node 24.22.1, Playwright 1.64.1 ve headless Chromium 156.0.8078.4 kullanıldı. API: Python 3.13.15, FastAPI 0.162.0, SQLAlchemy 2.1.6, tek Uvicorn worker.

Sabit profil: 1365 × 768 viewport, device scale factor 1, `tr-TR`; Chromium CPU throttling 4×, ağ gecikmesi 150 ms, indirme 1.600 kbit/sn, yükleme 750 kbit/sn. HTTP cache kapalı, service worker engelli; her koşuda yeni context kullanıldı. Tarayıcı yalnız yerel uygulama origin'ine erişir. Statik production dosyaları yerel sunucudan **sıkıştırmasız** sunuldu; aynı origin üzerindeki API proxy, ayrı geçici SQLite veritabanına sahip gerçek FastAPI'ye yönlendirdi. Test JWT imzası, geçici yerel JWKS üzerinden API tarafından doğrulandı; gerçek kullanıcı, Keycloak ve kalıcı geliştirme verisi kullanılmadı.

LCP navigation başlangıcından itibaren Chromium `largest-contentful-paint` gözlemcisinin son adayıdır. CLS, yakın kullanıcı girdileri hariç layout shift'lerin en büyük oturum penceresi toplamıdır: iki shift arası < 1 sn ve pencere < 5 sn. Gözlem, ilgili ekran ve katalogdaki 20. ürün görünür olduktan **5 sn daha** sürdürülerek etkileşimsiz tamamlandı; tüm yaşam döngüsü veya sonraki etkileşimler ölçülmedi. JS aktarımı, sayfa yüklenirken Chromium'un Script tipindeki kaynaklar için bildirdiği `encodedDataLength` toplamıdır; HTTP başlıkları dahildir. Byte sayıları ondalık kB olarak da gösterilir.

## Sonuçlar

| Ekran | Koşu | LCP (ms) | CLS | JS aktarımı (bayt) |
|---|---:|---:|---:|---:|
| Giriş | 1 | 2.848 | 0,01758 | 356.813 |
| Giriş | 2 | 2.780 | 0,01758 | 356.813 |
| Giriş | 3 | 2.768 | 0,01758 | 356.813 |
| Katalog | 1 | 3.008 | 0,01802 | 356.813 |
| Katalog | 2 | 2.896 | 0,01802 | 356.813 |
| Katalog | 3 | 2.880 | 0,01802 | 356.813 |

| Ekran | LCP ortancası | CLS ortancası | Aktarılan JS |
|---|---:|---:|---:|
| Giriş | 2.780 ms | 0,01758 | 356.813 bayt |
| Katalog | 2.896 ms | 0,01802 | 356.813 bayt |

Her koşuda LCP adayı sayfanın `H1` öğesiydi. Altı koşuda da beklenen ekran görünür oldu, kaynak/istek hatası gözlenmedi. Katalogda 20 sentetik ürün ve gerçek API yanıtları kullanıldı. JS aktarımına test API yanıtları dahil değildir.

## QA-027 seçici lazy loading tekrarı (18 Kasım 2026)

Aynı laboratuvar profili ve üçer tekrar kullanılarak ilk optimizasyon adımı ölçüldü. Yalnız etkileşimle açılan adres defteri, ürün oluşturma ve yönetici satıcı başvuruları panelleri dinamik yüklenir; ilk sayfa render'ında görünen sepet, sipariş geçmişi ve rol panelleri ana pakette kalır. Bu seçim, tüm panelleri lazy yükleyen ilk denemede gözlenen 0,061–0,096 CLS artışını önlemek içindir.

| Ekran | LCP tekrarları (ms) | LCP ortancası | CLS (tüm tekrarlar) | JS aktarımı |
|---|---|---:|---:|---:|
| Giriş | 2.812 / 2.808 / 2.788 | 2.808 ms | 0,01758 | 345.529 bayt |
| Katalog | 2.892 / 2.920 / 2.916 | 2.916 ms | 0,01802 | 345.529 bayt |

Build'in ana JS dosyası 345.331 bayt (Node gzip: 98.290 bayt); üç etkileşim paneli ayrı chunk'lardadır ve bu iki başlangıç senaryosunda istenmedi. Ölçüm anındaki HEAD `b39cff17b1c149a40aa4c33e5e7b346dba44ee58` idi; çalışma ağacı temiz değildi.

Baseline'a göre ilk aktarım 11.284 bayt (%3,2) azaldı; CLS baseline düzeyinde kaldı. LCP ortancası girişte 28 ms, katalogda 20 ms daha yüksekti ve her iki ekran da 2.500 ms hedefini karşılamadı. Bu sonuç bir LCP iyileşmesi göstermiyor; JS gzip boyutu için belirlenen 90.005 bayt hedefi de karşılanmadı. Seçici lazy loading CLS regresyonunu önleyerek kabul edilebilir durumda, ancak QA-027 tamamlanmış sayılmaz; daha büyük bir ilk-yük iyileştirmesi ayrı ölçümle doğrulanmalıdır.

## QA-027 etkileşim panelleri ve paralel ön yükleme (18 Kasım 2026)

Sonraki yinelemede sepet, sipariş geçmişi, yönetici siparişleri ve satıcı siparişleri ayrı lazy chunk'lara alındı. Buyer girişinde sepet/sipariş chunk'ları oturum ve kimlik API istekleriyle paralel, engelleyici olmayan şekilde ön yüklenir; HomePage bu ön yüklemeyi beklemez. Satıcı başvuru paneli ana pakette kaldı; kaynak incelemesi, bu panelin veri yanıtı LCP sonrasına sarktığında karşılama ve ürün bölümlerinin dikey konumunun değiştiğini gösterdi. Adres defteri, ürün oluşturma ve yönetici başvuru yönetimi yalnız etkileşimle yüklenmeye devam eder.

| Ekran | LCP tekrarları (ms) | LCP ortancası | CLS (tüm tekrarlar) | JS aktarımı |
|---|---|---:|---:|---:|
| Giriş | 2.660 / 2.676 / 2.752 | 2.676 ms | 0,01758 | 318.057 bayt |
| Katalog | 2.768 / 2.768 / 2.780 | 2.768 ms | 0,03822 | 335.909 bayt |

Baseline'a kıyasla giriş JS aktarımı 38.756 bayt (%10,9), katalog aktarımı 20.904 bayt (%5,9) azaldı. CLS her koşuda 0,1 hedefinin altında kaldı; katalog değeri baseline'dan yüksek olduğundan izlenmeye devam etmeli. LCP ortancaları baseline'a göre girişte 104 ms, katalogda 128 ms daha iyi olsa da 2.500 ms hedefini karşılamadı. Ana build dosyası 317.850 bayt (Node gzip: 93.630 bayt); gzip için belirlenen 90.005 bayt hedefi de henüz karşılanmadı. QA-027 devam ediyor.

## QA-027 OIDC istemcisini ihtiyaç anına erteleme (20 Kasım 2026)

`oidc-client-ts`, anonim giriş ekranında kullanılmadığı için dinamik import'a taşındı. Uygulama, OIDC callback URL'si veya `sessionStorage` içindeki bu istemciye ait kullanıcı kaydı varsa modül yüklemesini erken başlatır; anonim ziyaretçide kütüphaneyi yüklemez. Böylece geçerli oturumun kontrolü ve OIDC callback/redirect/logout davranışları korunur. Laboratuvar profili değişmeden her ekran üç kez ölçüldü.

| Ekran | LCP tekrarları (ms) | LCP ortancası | CLS (tüm tekrarlar) | İndirilen JS (bayt, sıkıştırmasız) |
|---|---|---:|---:|---:|
| Giriş | 2.284 / 2.316 / 2.540 | 2.316 ms | 0,01758 | 250.915 |
| Katalog | 2.840 / 2.828 / 2.788 | 2.828 ms | 0,03822–0,03826 | 336.453 |

Build ana paketi 250.717 bayt (Node gzip: 76.359 bayt); OIDC ayrı chunk'ı 67.489 bayt (gzip 16.977 bayt). Giriş senaryosunda yalnız ana paket indirilir; katalogda ana paket, OIDC, sepet ve sipariş geçmişi chunk'ları indirilir. Bu katalog chunk'larının gzip boyutları toplamı 99.067 bayttır; bu nedenle tam ilk-yük gzip hedefi 90.005 bayt hâlâ karşılanmaz. HTTP laboratuvar ölçümü sıkıştırmasızdır.

16 Kasım baseline'a göre giriş aktarımı 105.898 bayt (%29,7), katalog aktarımı 20.360 bayt (%5,7) azaldı. Giriş LCP ortancası 464 ms, katalog 68 ms iyileşti. CLS her iki senaryoda 0,1 altında kaldı. Girişin ortancası LCP hedefini karşılasa da üçüncü koşu 2.540 ms ile tekil koşu eşiğini aştı; katalog LCP'si 2.500 ms hedefinin üzerinde. Dolayısıyla QA-027 sürüyor; daha fazla optimizasyon ve aynı üçlü ölçüm gerekiyor. Ölçüm anındaki HEAD `dc34f87` idi ve çalışma ağacı değişiklik içeriyordu.

## QA-027 kapalı sepet panelini etkileşime erteleme (20 Kasım 2026)

Sepet açma düğmesi `HomePage` içinde kaldı; `CartPanel` chunk'ı yalnız kullanıcı düğmeye bastığında yükleniyor. Kapalı panelin başlangıçta yüklenmesini sağlayan import ve ön yükleme kaldırıldı. Bu ölçüm, laboratuvar senaryosunda sepet açılmadan yapıldı; açma etkileşiminin gecikmesi ve sonraki layout shift bu ilk-yük ölçümüne dahil değildir.

| Ekran | LCP tekrarları (ms) | LCP ortancası | CLS (tüm tekrarlar) | İndirilen JS (bayt, sıkıştırmasız) |
|---|---|---:|---:|---:|
| Giriş | 2.384 / 2.280 / 2.316 | 2.316 ms | 0,01758 | 251.070 |
| Katalog | 2.896 / 2.840 / 2.872 | 2.872 ms | 0,03278 | 330.392 |

Girişte yalnız ana JS dosyası; katalogda ana paket, OIDC ve sipariş geçmişi indirildi. Sepet chunk'ı katalogun başlangıç isteklerinde bulunmadı. 20 Kasım OIDC ölçümüne kıyasla katalog ilk aktarımı 6.061 bayt (%1,8) azaldı; giriş aktarımı 155 bayt arttı. Giriş LCP ortancası değişmedi; katalog LCP ortancası 44 ms yükseldi. CLS tüm koşularda 0,1 eşiğinin altında kaldı. İndirilen katalog dosyalarının gzip toplamı 97.012 bayttır; 90.005 bayt hedefi hâlâ aşılmaktadır.

Sonuç, kapalı sepet chunk'ını başlangıçtan çıkardığını ve başlangıç aktarımını azalttığını doğruluyor; katalog LCP'sinde iyileşme göstermiyor. Sepet açıldığında chunk'ın doğru yüklenmesi ve erişilebilir davranış hedefli testlerle doğrulandı (87/87 test geçti); laboratuvar ölçümü yalnız kapalı panel ilk yükünü kapsar. Ölçüm anındaki HEAD `dc34f87` idi; çalışma ağacı değişiklik içeriyordu.

**Karar (20 Kasım 2026):** QA-027 kapsamındaki lazy-loading denemeleri sonlandırıldı. Aktarımda ölçülebilir ama küçük azalma sağlandı; katalog LCP ve gzip hedefleri karşılanmadığından QA-027 tamamlanmış sayılmaz ve hedefleri karşılandı gibi raporlanmamalıdır. Aynı türde yeni panel erteleme denemeleri yapılmayacak. QA-027 ancak kök nedeni belirleyen, anlamlı ve ölçülebilir kazanım bekleyen sınırlı bir hipotezle yeniden açılabilir. Sıradaki aktif çalışma roadmap'teki manuel erişilebilirlik incelemesidir.

## Baseline JS boyutu ve yorum

16 Kasım baseline build'inde tek JS dosyası oluştu: `index-DuNIFa-B.js`, **356.615 bayt** ham dosya boyutu; Node'un varsayılan gzip algoritmasıyla **100.006 bayt**. Gzip, dosyanın ayrıca hesaplanan boyutudur; sunucu bu koşularda gzip kullanmadığı için ölçülen ağ aktarımı değildir. Aktarılan 356.813 bayt, ham JS ve HTTP protokol başlıklarını içerir. Bu baseline'da iki ekran aynı paketi yükledi; QA-027 seçici lazy loading sonuçları yukarıda raporlanmıştır.

İlk takip hedefleri olarak bu laboratuvar profilinde her koşuda LCP ≤ 2.500 ms ve CLS ≤ 0,1 önerilir; bunlar gerçek kullanıcı Core Web Vitals p75 ölçümü veya SLA değildir. Bu koşularda CLS hedefi karşılandı, LCP altı koşunun tamamında aşılmıştır. JS için aynı gzip yöntemiyle başlangıca göre en az %10 küçülme (≤ 90.005 bayt) ayrıca takip edilebilir; gerçek sunucuda sıkıştırma ve dağıtım koşulları ayrı ölçülmelidir. Üç tekrar ve paylaşılan makinedeki yük, gerçek kullanıcı deneyimi ya da üretim kapasitesi hakkında genelleme için yeterli değildir.

## Tekrar çalıştırma ve temizlik

Tekrar kullanılabilir ölçüm aracı depodaki [`performance/frontend-lab.mjs`](../performance/frontend-lab.mjs) dosyasıdır. Ölçüm oturumunun `qa026-frontend-lab-2026-11-16-evidence.zip` arşivi ham JSON çıktısını içerir; token veya özel anahtar içermez. Mevcut Playwright Chromium, frontend ve backend bağımlılıkları, Node, Python ve `uv` gerekir. `18080`, `18081`, `18082` portları boş olmalı; başka servisler durdurulmamalıdır. Araç yeni test kimliği ve geçici SQLite veritabanı oluşturur, veri seed'ini API üzerinden yapar ve kendi süreçlerini/veritabanını temizler.

Depo kökünden ve **yeni bir çıktı dosyası** kullanarak:

```powershell
$env:VITE_OIDC_AUTHORITY = "http://127.0.0.1:18082/realms/e2e"
$env:VITE_OIDC_CLIENT_ID = "shop-web"
npm.cmd --prefix apps\web run build
if ($LASTEXITCODE -ne 0) { throw "Production build başarısız" }
node performance\frontend-lab.mjs (Get-Location).Path "<yeni çıktı dosyası>.json"
if ($LASTEXITCODE -ne 0) { throw "Frontend laboratuvar ölçümü başarısız" }
```

Komut Windows'taki backend `.venv\Scripts\python.exe` yolunu kullanır. Ölçüm aracı başlangıçta portlar için kontrol yapar ve mevcut çıktı dosyasını ezmez; çakışma veya bağımlılık hatasında ölçüme devam edilmez. Farklı makine, tarayıcı, ağ profili, bundle, veri veya API altyapısıyla elde edilen sayılar doğrudan karşılaştırılmamalıdır.
