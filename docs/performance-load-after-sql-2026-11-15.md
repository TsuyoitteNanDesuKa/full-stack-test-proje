# QA-026 — SQL optimizasyonu sonrası yük ölçümü

## Yöntem ve kapsam

- 15 Kasım 2026 saat 14:33–15:31 arasında, SQL değişikliğinden etkilenen buyer sipariş geçmişi ve seller listesi ölçüldü. Her biri üç bağımsız koşu: `orders_10`, `orders_100`, `orders_1000`, `seller`; toplam 12 koşu. Katalog, checkout ve admin için bu çalışmada yeni yük sonucu yoktur.
- Her koşuda yeni, izole PostgreSQL container'ı, migration ve aynı sentetik seed kullanıldı. 1.000 ürün, ayrı buyer başına 10/100/1.000 sipariş, sipariş başına iki kalem ve bir sipariş/bir fulfillment olayı vardır. Seller sorgusu `limit=50&offset=0` kullanır. Test sonrası yalnız bu koşuların servisleri durduruldu ve token dosyaları silindi.
- Önceki [API baseline'ındaki](./performance-baseline-2026-11-14.md) profil kullanıldı: 60 sn ramp-up, 180 sn 10 VU, 30 sn ramp-down ve iterasyon arası 1 sn bekleme. Tablolar yalnız sabit fazda başlayan istekleri içerir; p95 başarılı isteklerden, hata oranı tüm iş kontrollerinden hesaplanır. 500 ms ve %1 eşikleri her koşu için ayrı değerlendirilir.
- Windows 11, Intel i5-10300H (4 çekirdek/8 mantıksal işlemci), 15,84 GiB RAM; Python 3.13.15, FastAPI 0.162.0, Uvicorn 0.54.0, SQLAlchemy 2.1.6, k6 2.4.0, Docker 29.9.2 ve öncekiyle aynı PostgreSQL 17 image'ı kullanıldı. API tek worker, reload kapalı; API ve k6 hostta, PostgreSQL Docker Desktop'ta çalıştı. Diğer yerel PostgreSQL ve Keycloak container'ları çalışmaya devam etti.
- Ölçülen çalışma ağacı temiz değildi: `1ecd2b38e20831d4b7c5e7f709ca3e322b8da40c` üzerine SQL optimizasyonu ve `dnspython`/`opentelemetry-api` bağımlılık güncellemesi uygulanmıştı. Çalıştırılan kaynakların SHA-256 değerleri kanıt arşivinde kayıtlı ve koşular boyunca doğrulandı. Bu nedenle sonuçlar yalnız commit'e atfedilemez; değişen ortam yükü ve bağımlılıklar da karşılaştırmayı etkileyebilir.

## Koşular

| Profil | Koşu | İstek | Hata | p50 ms | p95 ms | p99 ms | RPS | Yanıt p50 bayt | p95 ≤ 500 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Buyer 10 | 1 | 1.769 | 0 | 15,5 | 27,6 | 42,8 | 9,83 | 10.185 | Geçti |
| Buyer 10 | 2 | 1.771 | 0 | 15,6 | 23,5 | 28,9 | 9,84 | 10.185 | Geçti |
| Buyer 10 | 3 | 1.766 | 0 | 15,9 | 26,0 | 39,3 | 9,81 | 10.185 | Geçti |
| Buyer 100 | 1 | 1.734 | 0 | 31,5 | 65,7 | 89,2 | 9,63 | 102.465 | Geçti |
| Buyer 100 | 2 | 1.688 | 0 | 37,8 | 161,7 | 371,2 | 9,38 | 102.465 | Geçti |
| Buyer 100 | 3 | 1.718 | 0 | 39,7 | 78,0 | 110,2 | 9,54 | 102.465 | Geçti |
| Buyer 1.000 | 1 | 627 | 0 | 1.702,8 | 2.997,6 | 4.505,3 | 3,48 | 1.030.665 | Kaldı |
| Buyer 1.000 | 2 | 674 | 0 | 1.631,0 | 1.950,0 | 2.137,0 | 3,74 | 1.030.665 | Kaldı |
| Buyer 1.000 | 3 | 653 | 0 | 1.667,2 | 2.302,9 | 3.384,7 | 3,63 | 1.030.665 | Kaldı |
| Seller 50 | 1 | 1.764 | 0 | 17,5 | 30,6 | 60,4 | 9,80 | 27.901 | Geçti |
| Seller 50 | 2 | 1.759 | 0 | 19,7 | 38,9 | 77,3 | 9,77 | 27.901 | Geçti |
| Seller 50 | 3 | 1.764 | 0 | 19,0 | 27,8 | 55,2 | 9,80 | 27.901 | Geçti |

Tüm koşular tamamlandı ve hata oranı %0 oldu; bu, p95 hedefinin de geçtiği anlamına gelmez. Buyer 1.000 profilinde üç koşunun tamamı hedefi aştı. 100 siparişte ikinci koşunun p95 ve p99 değeri diğer koşulardan yüksektir; bu değişkenlik sonucu gizlenmedi.

## Önce / sonra

| Profil | Önceki üç koşu p95 ortancası (ms) | Sonraki üç koşu p95 ortancası (ms) | Ortanca değişimi | Sonraki üç koşu hedefte |
|---|---:|---:|---:|---|
| Buyer 10 | 221,2 | 26,0 | −%88,2 | Evet |
| Buyer 100 | 4.582,0 | 78,0 | −%98,3 | Evet |
| Buyer 1.000 | 44.234,9 | 2.302,9 | −%94,8 | Hayır |
| Seller 50 | 529,4 | 30,6 | −%94,2 | Evet |

Ortancalar koşuların p95 değerlerinin ortancasıdır; birleştirilmiş isteklerin p95'i değildir. Sabit VU profili sabit RPS anlamına gelmez; özellikle 1.000 siparişte önceki baseline'da yaklaşık 0,23–0,24 RPS, şimdi 3,48–3,74 RPS gerçekleşti. Paylaşılan makinedeki yük farklı olabilir; sonuçlar üretim SLA'sı veya kapasite garantisi değildir.

## Kaynak gözlemleri

Yaklaşık 15–18 saniyede bir alınan örneklerden, 60–240. saniye aralığı ve üç koşu birlikte kullanıldı. API CPU, ardışık örneklerin CPU zamanı farkıdır (%100 bir mantıksal çekirdek); bellek working set'tir. PostgreSQL CPU ve bellek Docker'ın noktasal container ölçümleridir. Bu örnekler tüm sistem kullanımını veya darboğazın kesin nedenini göstermez.

| Profil | API CPU ortalama / en yüksek | API bellek en yüksek | PostgreSQL CPU ortalama / en yüksek | PostgreSQL bellek en yüksek |
|---|---:|---:|---:|---:|
| Buyer 10 | %8,2 / %10,1 | 99,7 MiB | %2,6 / %4,4 | 51,0 MiB |
| Buyer 100 | %25,7 / %32,5 | 106,8 MiB | %6,0 / %10,7 | 52,1 MiB |
| Buyer 1.000 | %99,8 / %102,3 | 181,1 MiB | %16,8 / %20,3 | 63,3 MiB |
| Seller 50 | %11,0 / %14,2 | 100,8 MiB | %3,1 / %5,4 | 51,7 MiB |

## Sonuç ve kanıt

[SQL analizinde](./performance-sql-analysis-2026-11-14.md) 1.000 buyer sipariği için sorgu sayısı 6.001'den 13'e düşmüştü. Yük altında p95 belirgin iyileşti ancak 500 ms hedefi sağlanmadı; yanıt hâlâ sayfalanmamış yaklaşık 1 MB ve API CPU örnekleri bir çekirdeğe yakın. Toplu sorgu, ORM/serileştirme ve yanıt maliyetini profillemek; sınırlı sayfalamanın API/UI uyumluluğunu ayrıca tasarlamak sonraki işlerdir. Nedeni bu ölçüm tek başına kesinleştirmez.

12 koşunun ham k6 verileri, özet/işlenmiş raporları, kaynak örnekleri, ortam ve kaynak hash'leri ölçüm oturumunun `qa026-optimization-load-2026-11-15-raw.zip` arşivindedir. Arşiv, ölçülen kayıtlı olmayan backend değişikliklerini de içerir; token veya fixture içermez. Koşuların geçerliliği, p95 değerlerinin k6 özetleriyle uyumu ve eşik kararları doğrulandı. Tekrar adımları [performans notlarındadır](../performance/README.md).
