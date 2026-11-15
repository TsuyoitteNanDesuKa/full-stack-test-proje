# QA-026 — Sipariş listelerinde SQL analizi

Bu rapordaki ilk ölçümler optimizasyon öncesine aittir. 15 Kasım 2026'da uygulanan iyileştirme ve karşılaştırma aşağıdadır.

## Ortam ve yöntem

- 14 Kasım 2026'da Windows üzerinde, ayrı Docker container'ında PostgreSQL 17.11 ve migration uygulanmış `shop_perf_test` veritabanı kullanıldı. Ölçüm anındaki commit `8b2173ba1c69674f2746cec7c5d9553df4dfd7eb`; [yük baseline'ından](./performance-baseline-2026-11-14.md) bu commit'e API kaynakları, migration'lar ve seed değişmedi.
- [Performans seed'i](../performance/README.md) ile 1.000 ürün, ayrı buyer profillerinde 10/100/1.000 olmak üzere toplam 1.110 sipariş, 2.220 sipariş kalemi ve 1.110 fulfillment oluşturuldu. Her siparişte bir fulfillment, bir sipariş ve bir fulfillment olayı var; ödeme ve iade yok. Tüm fulfillment'lar aynı seller'a ait. Seed sonrası tablolarda otomatik `ANALYZE` gerçekleşti.
- Gerçek listeleme endpoint'leri FastAPI `TestClient` ile süreç içinde çağrıldı. Test JWT imzası ve roller doğrulandı; JWKS ağ çağrısı ve uygulamanın lifespan worker'ı kullanılmadı. SQLAlchemy cursor event'leri yalnız istek sırasındaki veritabanı çağrılarını saydı. Bağlantının salt okunur olduğu doğrulandı.
- Her senaryoda bir istek ölçüldü; ardından aynı veritabanında analiz tekrarlandı. İki ölçümde de yanıt sayıları ve sorgu sayıları eşleşti. Bunlar **iki bağımsız yük testi veya p95 ölçümü değildir**. Planlar isteklerden sonra yakalanan sorgu ve sentetik parametrelerle ayrı `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` çalıştırılarak alındı.

## İstek başına sorgu sayıları

| Endpoint / profil | Dönen kayıt | SQL sorgusu | Tekil tanı süresi, tekrar (ms) |
|---|---:|---:|---:|
| Buyer: 10 sipariş | 10 | 61 | 78,8 |
| Buyer: 100 sipariş | 100 | 601 | 675,4 |
| Buyer: 1.000 sipariş | 1.000 | 6.001 | 6.340,3 |
| Seller: limit 10, offset 0 | 10 | 23 | 48,4 |
| Seller: limit 50, offset 0 | 50 | 103 | 136,0 |
| Seller: limit 100, offset 0 | 100 | 203 | 207,1 |
| Seller: limit 50, offset 1.000 | 50 | 103 | 114,0 |
| Admin: limit 10, offset 0 | 10 | 71 | 91,0 |
| Admin: limit 50, offset 0 | 50 | 351 | 407,7 |
| Admin: limit 100, offset 0 | 100 | 701 | 784,3 |
| Admin: limit 50, offset 1.000 | 50 | 351 | 346,3 |

Buyer yanıtları sırasıyla 10.185, 102.465 ve 1.030.665 bayttır; endpoint sayfalanmadığı için tüm geçmişi döndürür. Süreler ısınmış, yüksüz, instrumentation ve yanıt üretimini içeren tekil süreç içi ölçümlerdir; 10 VU baseline p95 değerleriyle doğrudan karşılaştırılmaz.

Bu seed ve dolu sonuçlar için buyer sorguları `1 + 6N`, seller `3 + 2N`, admin `1 + 7N` şeklinde büyüdü; `N` dönen sipariş veya fulfillment sayısıdır. Bunlar tüm olası veriler için garanti edilmiş formüller değildir. Buyer her sipariş için kalemleri, iadeleri, fulfillment'ları, fulfillment kalemlerini/olaylarını ve sipariş geçmişini ayrı sorgular; admin buna ek olarak ödeme sorgular. Seller her fulfillment için kalem ve olayları ayrı sorgular. Sorgu sayısının kayıt sayısıyla büyümesi üç listede de N+1 örüntüsünü doğruluyor.

## Temsilî PostgreSQL planları

Aşağıdaki süreler tekrar ölçümünde tek bir ayrı plan çalıştırmasının PostgreSQL yürütme süreleridir; HTTP süresi, tüm sorguların toplamı veya istemcinin beklediği süre değildir. `shared hit/read` kök plan düğümündeki blok sayılarıdır.

| Sorgu | Plan özeti | Dönen / işlenen satırlar | Yürütme (ms) | Shared hit / read |
|---|---|---|---:|---:|
| Buyer 1.000: ana sipariş sorgusu | Seq Scan → quicksort | 1.000; 110 satır filtrelendi | 0,577 | 13 / 0 |
| Seller, limit 50 / offset 0 | Seq Scan → top-N heapsort → Limit | taranan 1.110; sıralamadan 50 | 0,366 | 13 / 0 |
| Seller, limit 50 / offset 1.000 | Seq Scan → quicksort → Limit | taranan 1.110; sıralamadan 1.050 | 0,582 | 13 / 0 |
| Admin, limit 50 / offset 0 | Seq Scan → top-N heapsort → Limit | taranan 1.110; sıralamadan 50 | 0,455 | 13 / 0 |
| Admin, limit 50 / offset 1.000 | Seq Scan → quicksort → Limit | taranan 1.110; sıralamadan 1.050 | 0,618 | 13 / 0 |

Buyer'ın 10 ve 100 siparişli profillerinde ana sorgu mevcut `ix_orders_owner_subject` indeksini ve sıralamayı kullandı. 1.000 siparişli buyer, 1.110 siparişin büyük bölümüne sahip olduğundan bu veri üzerinde `Seq Scan` seçimi tek başına eksik indeks kanıtı değildir. Örnek ilişkili sorgular çoğunlukla mevcut `order_id` veya `fulfillment_id` indekslerini kullandı; ilk ölçümde tekil yürütmeleri yaklaşık 0,034–0,068 ms, 2–3 shared hit ve 0 read idi. Bu planlar, tek bir pahalı sorgudan ziyade **çok sayıdaki sorgu ve round-trip'in** araştırılması gerektiğini destekler; sunucu plan süreleri doğrudan istemci veya HTTP süresine eşit değildir.

## Sınırlamalar ve takip

- Planlar ve süreler sıcak cache, küçük veri, sıfır ödeme/iade ve tüm siparişlere sahip tek seller ile sınırlıdır. Derin offset'in daha fazla satır sıralattığı görülüyor; büyük/çeşitli verilerde indeks ya da cursor sayfalamasının etkisi henüz kanıtlanmadı.
- Öncelik: buyer/admin için ilişkili verileri, seller için fulfillment kalem ve olaylarını toplu yükleme seçeneğini incelemek; sipariş sıralamasını, yetki sınırlarını ve yanıt sözleşmesini korumak. Buyer için sınırlı sayfalama ayrıca API ve UI uyumluluğu değerlendirilerek tasarlanmalı.
- İyileştirme sonrası üç tekrarlı yük baseline'ı yeniden ölçülmeli; aşağıdaki tekil tanı ölçümleri p95 hedefini doğrulamaz.

## 15 Kasım 2026: toplu yükleme sonrası karşılaştırma

Buyer ve admin listeleri siparişe ait kalemleri, iadeleri, fulfillment'ları ve geçmişi; admin ayrıca ödemeleri toplu okur. Fulfillment kalemleri ve olayları buyer, admin ve seller için toplu okunur. Parametre sınırları için sorgular en fazla 500 kimliklik gruplara ayrılır. Yanıt sözleşmesi ve mevcut filtre/sıralama değiştirilmedi; buyer sayfalaması hâlâ ayrı tasarım işidir.

Aynı seed profiliyle yeni izole PostgreSQL container'ında önceki tanı aracı kullanıldı. Her satır için önceki tekrar ile sonraki **tek bir yüksüz, süreç içi** istek karşılaştırıldı; tüm profillerde dönen kayıt sayısı ve yanıt bayt sayısı eşleşti. Eşit bayt sayısı tek başına içerik eşitliği kanıtlamaz; detay/list yanıt karşılaştırmaları ve erişim testleri ayrıca çalıştırıldı.

| Profil | Önce: sorgu | Sonra: sorgu | Sonra: tekil süre (ms) |
|---|---:|---:|---:|
| Buyer 10 | 61 | 7 | 25,0 |
| Buyer 100 | 601 | 7 | 47,3 |
| Buyer 1.000 | 6.001 | 13 | 406,0 |
| Seller limit 10 / offset 0 | 23 | 5 | 87,9 |
| Seller limit 50 / offset 0 | 103 | 5 | 39,7 |
| Seller limit 100 / offset 0 | 203 | 5 | 38,1 |
| Seller limit 50 / offset 1.000 | 103 | 5 | 30,7 |
| Admin limit 10 / offset 0 | 71 | 8 | 45,9 |
| Admin limit 50 / offset 0 | 351 | 8 | 43,2 |
| Admin limit 100 / offset 0 | 701 | 8 | 53,0 |
| Admin limit 50 / offset 1.000 | 351 | 8 | 39,9 |

Süreler tek örnek, farklı geçici veritabanı ve farklı çalışma anlarıyla sınırlıdır. Ayrı [üç tekrarlı yük karşılaştırmasında](./performance-load-after-sql-2026-11-15.md) 1.000 sipariş profili iyileşmesine rağmen 500 ms p95 hedefini karşılamadı. Sonraki SQL/plan JSON çıktısı ölçüm oturumunun çalışma alanındaki `qa026-sql-after-optimization/sql-results.json` dosyasındadır; gerçek test token'ları temizlenmiştir.

## Kanıt ve tekrar çalıştırma

Ölçüm oturumunun `qa026-sql-analysis-evidence.zip` arşivinde tanı aracı ve iki çalışmanın SQL/plan JSON çıktıları bulunur; fixture, JWKS, token ve parola içermez. Arşiv repo dışındadır. Tekrar için [izole veritabanı hazırlığındaki](../performance/README.md) container, migration ve seed adımları uygulanır; mevcut veritabanı kullanılmaz. Seed'in ürettiği token içeren fixture'lar korunup işlem sonunda belgede anlatıldığı gibi temizlenir. API veya JWKS sunucusu başlatmak gerekmez.

Arşivi açtıktan sonra depo kökünde, aynı hazırlanmış salt okunur tanı verisi ve bağımlılıklarla:

```powershell
$env:SHOP_DATABASE_URL = "postgresql+psycopg://perf:local-perf-only@127.0.0.1:15432/shop_perf_test"
$out = "<mevcut, boş çıktı dizini>"
uv run --directory apps\api python "<arşivin açıldığı dizin>\measure-sql.py" --repo (Get-Location).Path --output $out
```

Araç URL'yi yerel `15432` portu ve `shop_perf_test` adıyla sınırlar, ancak bu kontrol izolasyonu tek başına garanti etmez. Yalnız işlem için oluşturulan container kullanılmalı; iş bitince yalnız o container durdurulmalıdır. Araç API'nin test yardımcılarına ve geliştirme bağımlılıklarına ihtiyaç duyar.
