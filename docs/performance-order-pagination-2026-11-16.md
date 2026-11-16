# QA-026 — Sayfalı sipariş geçmişi yük ölçümü

## Yöntem ve kapsam

- 16 Kasım 2026 saat 19:22–19:37 arasında 1.000 siparişli buyer için `GET /api/v1/orders/page?limit=20&offset=0` üç bağımsız koşuda ölçüldü. Her koşu yeni, izole PostgreSQL container'ı, migration, aynı sentetik seed ve yeniden başlatılan API/JWKS kullandı. Seed: 1.000 ürün; ayrı alıcılar için 10/100/1.000 sipariş; sipariş başına iki kalem ve bir sipariş/bir fulfillment olayı.
- Her yanıtta HTTP 200, 20 sipariş, `limit=20`, `offset=0` ve `has_more=true` doğrulandı. Testten önce ayrı bir ortamda kısa smoke koşusu ve SQL tanısı yapıldı; smoke sonuçları baseline'a dahil edilmedi.
- Önceki yük profili kullanıldı: 60 sn ramp-up, 180 sn 10 VU, 30 sn ramp-down ve iterasyonlar arasında 1 sn bekleme. Yalnız sabit fazda başlayan istekler raporlandı. p50/p95/p99 başarılı isteklerden; hata oranı tüm iş kontrollerinden hesaplandı. Her koşuda p95 ≤ 500 ms ve hata oranı < %1 ayrı değerlendirildi.
- Windows 11, Intel i5-10300H (4 çekirdek/8 mantıksal işlemci), yaklaşık 15,84 GiB RAM; Python 3.13.15, FastAPI 0.162.0, Uvicorn 0.54.0, SQLAlchemy 2.1.6, k6 2.4.0, Docker 29.9.2 ve önceki ölçümle aynı PostgreSQL 17 image'ı kullanıldı. API tek worker, reload kapalı; API ve k6 hostta, PostgreSQL Docker Desktop'ta çalıştı. Mevcut yerel PostgreSQL ve Keycloak container'ları çalışmaya devam etti.
- Ölçülen çalışma ağacı temiz değildi: `f18eccd91754acff9ab51c781473211225213f4a` üzerine sayfalama değişiklikleri ve yeni yük senaryosu uygulanmıştı. Çalıştırılan kaynakların SHA-256 değerleri üç koşu boyunca doğrulandı; hash'ler ve ilgili kayıtlı olmayan kaynak farkı kanıt arşivindedir.

## Sonuçlar

| Koşu | İstek | Hata | p50 ms | p95 ms | p99 ms | RPS | Yanıt p50 bayt | p95 ≤ 500 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 1.753 | 0 | 18,1 | 73,2 | 179,4 | 9,74 | 20.729 | Geçti |
| 2 | 1.757 | 0 | 18,8 | 54,8 | 153,9 | 9,76 | 20.729 | Geçti |
| 3 | 1.759 | 0 | 19,4 | 28,2 | 41,6 | 9,77 | 20.729 | Geçti |

Üç koşu geçerli; her birinde hata oranı %0 ve ilk sayfa için 500 ms hedefi sağlandı. Koşuların p95 değerlerinin ortancası **54,8 ms**'dir; bu değer birleştirilmiş isteklerin p95'i değildir. İlk iki koşunun kuyruk gecikmeleri üçüncüden yüksektir. Sabit VU, sabit RPS veya üretim kapasitesi garantisi anlamına gelmez.

Yüksüz, süreç içi ve SQLAlchemy ile araçlandırılmış ayrı bir tanı isteğinde 20 sipariş için **7 SQL sorgusu** ve 20.729 bayt yanıt gözlendi. Bu tek tanı isteği yük altındaki SQL maliyetini veya p95'i temsil etmez.

## Önceki ölçümle ilişki

[SQL optimizasyonu sonrası önceki ölçüm](./performance-load-after-sql-2026-11-15.md), aynı büyüklükte geçmişin **tamamını** döndüren eski `/api/v1/orders` uç noktasında p95 ortancasını 2.302,9 ms ve yanıtı 1.030.665 bayt bulmuştu. Yeni ölçüm yalnız ilk 20 siparişi döndürür; farklı yanıt kapsamları nedeniyle bu p95 değerleri aynı iş yükünün doğrudan önce/sonra karşılaştırması değildir. Eski sınırsız uç nokta uyumluluk için korunmuştur ve bu optimizasyon eski istemcilerin tam-geçmiş maliyetini çözmez.

Bu çalışma ilk sayfayı ölçer; sonraki veya derin offset'ler, eş zamanlı yeni siparişler ve tüm geçmişi sayfalarla dolaşma süresi ölçülmedi. PostgreSQL/Playwright işlevsel doğrulaması ayrı takip işidir.

## Kaynak gözlemleri ve kanıt

Yaklaşık 16–17 saniyede bir alınan noktasal örneklerden, üç koşunun 60–240. saniyelerindeki toplam 33 örnek kullanıldı. API CPU ardışık örnekler arasındaki CPU zamanı farkıdır (%100 bir mantıksal çekirdek); bellek working set'tir. PostgreSQL CPU ve bellek Docker noktasal ölçümleridir. CPU ve bellek değerleri tüm sistem yükünü veya darboğaz nedenini göstermez.

| Kaynak | Ortalama CPU | En yüksek CPU | En yüksek bellek |
|---|---:|---:|---:|
| API | %10,1 | %14,0 | 100,7 MiB |
| PostgreSQL | %3,3 | %5,3 | 51,5 MiB |

Üç koşunun ham k6 verileri, özetleri, işlenmiş raporları, kaynak örnekleri, SQL tanısı, ortam ve kaynak hash'leri ile ölçülen kaynak farkı ölçüm oturumunun `qa026-page-2026-11-16-evidence.zip` arşivindedir. Arşivde token veya fixture yoktur. Ham değerlerden hesaplanan p95'ler k6 özetleriyle doğrulandı. Tekrar adımları [performans notlarındadır](../performance/README.md).
