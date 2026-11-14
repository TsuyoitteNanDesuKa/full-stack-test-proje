# QA-026 — API performans başlangıç çizgisi

- Başlangıç: 2026-11-14T11:08:39.260904+03:00. Commit: `2d624cda3c097efb351f065770bbda9d9b6b3d61`; çalışma ağacı ölçüm başlangıcında temiz.
- Ortam: Windows-11-10.0.26200-SP0, Intel(R) Core(TM) i5-10300H CPU @ 2.50GHz (4 çekirdek / 8 mantıksal işlemci), 15.84 GiB RAM.
- Python 3.13.15; FastAPI=0.162.0 uvicorn=0.54.0 SQLAlchemy=2.1.6; Docker 29.9.2; PostgreSQL `postgres:17-alpine` image `sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b`; k6.exe v2.4.0 (commit/dd9395906d, go1.26.11, windows/amd64).
- FastAPI reload kapalı, tek worker; PostgreSQL ayrı geçici container; test JWKS ile RS256 token doğrulama. API ve k6 aynı Windows hostunda, PostgreSQL Docker Desktop'ta çalıştı. Diğer yerel PostgreSQL/Keycloak container'ları çalışmaya devam etti.
- Her koşuda yeni test veritabanı ve kimlikler: 1.000 ürün, ayrı buyer başına 10/100/1.000 sipariş, sipariş başına iki kalem ve bir sipariş/bir fulfillment olayı. Checkout için ayrı buyer ve ürünler kullanıldı; ödeme mock'tur.
- Her varyant üç bağımsız koşu: 60 sn ramp-up, 180 sn 10 VU, 30 sn ramp-down; iterasyon arası 1 sn bekleme. Aşağıdaki istekler sabit yük fazında başlayan işlemlerdir. Başarılı isteklerin gecikmesi ölçülür; başarısızlık ayrıca raporlanır.
- Hedefler: liste ve sepet adımlarında p95 ≤ 500 ms; checkout ve ödeme adımlarında p95 ≤ 1.000 ms; senaryo hata oranı < %1. Bunlar yerel öğrenme hedefleridir, üretim SLA'sı değildir.
- Tüm koşularda ölçülen hata oranı %0'dır; ancak buyer ve seller liste senaryolarında bazı veya tüm koşular gecikme hedefini aşmıştır.

## Her koşunun sonuçları

| Senaryo / adım | Koşu | İstek | Hata | p50 ms | p95 ms | p99 ms | RPS | Yanıt p50 bayt | p95 hedefi |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| catalog / catalog | 1 | 1790 | 0 | 7.3 | 13.3 | 20.7 | 9.94 | 3850 | Geçti |
| catalog / catalog | 2 | 1782 | 0 | 7.8 | 20.1 | 48.7 | 9.90 | 3850 | Geçti |
| catalog / catalog | 3 | 1781 | 0 | 8.3 | 21.1 | 51.6 | 9.89 | 3850 | Geçti |
| catalog_search / catalog_search | 1 | 1782 | 0 | 9.1 | 16.2 | 22.6 | 9.90 | 3843 | Geçti |
| catalog_search / catalog_search | 2 | 1785 | 0 | 8.5 | 16.0 | 25.4 | 9.92 | 3843 | Geçti |
| catalog_search / catalog_search | 3 | 1782 | 0 | 9.2 | 17.3 | 30.6 | 9.90 | 3843 | Geçti |
| orders_10 / orders_10 | 1 | 1482 | 0 | 146.8 | 605.9 | 1120.5 | 8.23 | 10185 | Kaldı |
| orders_10 / orders_10 | 2 | 1606 | 0 | 103.4 | 221.2 | 336.7 | 8.92 | 10185 | Geçti |
| orders_10 / orders_10 | 3 | 1601 | 0 | 108.1 | 200.4 | 277.1 | 8.89 | 10185 | Geçti |
| orders_100 / orders_100 | 1 | 393 | 0 | 3328.5 | 5049.8 | 11359.9 | 2.18 | 102465 | Kaldı |
| orders_100 / orders_100 | 2 | 411 | 0 | 3375.7 | 4582.0 | 5444.4 | 2.28 | 102465 | Kaldı |
| orders_100 / orders_100 | 3 | 427 | 0 | 3279.9 | 4066.6 | 4338.0 | 2.37 | 102465 | Kaldı |
| orders_1000 / orders_1000 | 1 | 43 | 0 | 40627.0 | 43304.0 | 43747.9 | 0.24 | 1030665 | Kaldı |
| orders_1000 / orders_1000 | 2 | 43 | 0 | 42095.9 | 44234.9 | 44658.1 | 0.24 | 1030665 | Kaldı |
| orders_1000 / orders_1000 | 3 | 41 | 0 | 42400.5 | 47839.5 | 47910.8 | 0.23 | 1030665 | Kaldı |
| seller / seller | 1 | 1418 | 0 | 233.1 | 529.4 | 705.5 | 7.88 | 27901 | Kaldı |
| seller / seller | 2 | 1394 | 0 | 239.4 | 625.8 | 806.8 | 7.74 | 27901 | Kaldı |
| seller / seller | 3 | 1451 | 0 | 207.3 | 485.2 | 758.9 | 8.06 | 27901 | Geçti |
| checkout / cart_read | 1 | 1553 | 0 | 8.0 | 22.2 | 50.8 | 8.63 | 30 | Geçti |
| checkout / cart_add | 1 | 1553 | 0 | 20.7 | 47.6 | 103.3 | 8.63 | 192 | Geçti |
| checkout / checkout | 1 | 1553 | 0 | 45.3 | 103.4 | 185.9 | 8.63 | 988 | Geçti |
| checkout / payment_create | 1 | 1555 | 0 | 20.5 | 46.8 | 84.4 | 8.64 | 388 | Geçti |
| checkout / payment_complete | 1 | 1555 | 0 | 34.4 | 81.1 | 130.9 | 8.64 | 292 | Geçti |
| checkout / cart_read | 2 | 1555 | 0 | 8.6 | 22.2 | 44.5 | 8.64 | 30 | Geçti |
| checkout / cart_add | 2 | 1556 | 0 | 21.4 | 46.7 | 74.9 | 8.64 | 192 | Geçti |
| checkout / checkout | 2 | 1558 | 0 | 46.6 | 101.9 | 154.7 | 8.66 | 988 | Geçti |
| checkout / payment_create | 2 | 1558 | 0 | 21.6 | 45.8 | 63.5 | 8.66 | 388 | Geçti |
| checkout / payment_complete | 2 | 1558 | 0 | 35.1 | 76.7 | 117.5 | 8.66 | 292 | Geçti |
| checkout / cart_read | 3 | 1505 | 0 | 9.2 | 38.7 | 74.4 | 8.36 | 30 | Geçti |
| checkout / cart_add | 3 | 1504 | 0 | 23.2 | 72.1 | 132.8 | 8.36 | 192 | Geçti |
| checkout / checkout | 3 | 1504 | 0 | 52.1 | 170.2 | 290.1 | 8.36 | 988 | Geçti |
| checkout / payment_create | 3 | 1503 | 0 | 23.8 | 73.8 | 120.3 | 8.35 | 386 | Geçti |
| checkout / payment_complete | 3 | 1503 | 0 | 39.0 | 109.1 | 226.1 | 8.35 | 291 | Geçti |

## Üç koşunun p95 ortancası

| Senaryo / adım | p95 ortanca (ms) | Hedef (ms) | Üç koşunun tamamı hedefte | Üç koşu hata oranı |
|---|---:|---:|---|---|
| catalog / catalog | 20.1 | 500 | Evet | %0.00 / %0.00 / %0.00 |
| catalog_search / catalog_search | 16.2 | 500 | Evet | %0.00 / %0.00 / %0.00 |
| orders_10 / orders_10 | 221.2 | 500 | Hayır | %0.00 / %0.00 / %0.00 |
| orders_100 / orders_100 | 4582.0 | 500 | Hayır | %0.00 / %0.00 / %0.00 |
| orders_1000 / orders_1000 | 44234.9 | 500 | Hayır | %0.00 / %0.00 / %0.00 |
| seller / seller | 529.4 | 500 | Hayır | %0.00 / %0.00 / %0.00 |
| checkout / cart_read | 22.2 | 500 | Evet | %0.00 / %0.00 / %0.00 |
| checkout / cart_add | 47.6 | 500 | Evet | %0.00 / %0.00 / %0.00 |
| checkout / checkout | 103.4 | 1000 | Evet | %0.00 / %0.00 / %0.00 |
| checkout / payment_create | 46.8 | 1000 | Evet | %0.00 / %0.00 / %0.00 |
| checkout / payment_complete | 81.1 | 1000 | Evet | %0.00 / %0.00 / %0.00 |

## Kaynak gözlemleri

Yaklaşık 15–18 saniyede bir alınan örneklerden, 60–240. saniye aralığı kullanılmıştır. API CPU yüzdesi, ardışık örnekler arasındaki CPU saniyesi farkıdır (%100 bir mantıksal çekirdek); bellek working set'tir. PostgreSQL yüzdesi Docker'ın noktasal container CPU ölçümüdür. Bunlar sınırlı tanısal örneklerdir, tüm sistem kullanımı değildir.

| Senaryo | API CPU ortalama / en yüksek | API bellek en yüksek | PostgreSQL CPU ortalama / en yüksek | PostgreSQL bellek en yüksek |
|---|---:|---:|---:|---:|
| catalog | %4.7 / %5.7 | 98.1 MiB | %0.9 / %2.6 | 49.1 MiB |
| catalog_search | %4.9 / %5.7 | 98.3 MiB | %2.4 / %3.4 | 48.4 MiB |
| orders_10 | %40.1 / %45.9 | 100.6 MiB | %16.3 / %25.1 | 51.6 MiB |
| orders_100 | %112.3 / %120.4 | 109.6 MiB | %28.1 / %32.9 | 64.0 MiB |
| orders_1000 | %114.8 / %121.4 | 180.9 MiB | %26.1 / %32.8 | 65.5 MiB |
| seller | %60.9 / %66.9 | 102.0 MiB | %18.3 / %28.3 | 57.2 MiB |
| checkout | %45.5 / %52.2 | 100.7 MiB | %18.0 / %29.6 | 62.2 MiB |

## Yorum ve sınırlar

- p95 hedefinde bir koşunun bile başarısız olması, üç koşunun tamamı için hedefin karşılanmadığı anlamına gelir; ortanca tek başına geçme kararı değildir.
- Buyer sipariş geçmişi profillerinde yanıt boyutu, p95 ve gerçekleşen throughput birlikte incelenmelidir. Kök neden ve sayfalama/indeks kararı için SQL sorgu sayısı ve PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` ayrıca ölçülmelidir.
- Keycloak giriş performansı, gerçek ödeme/kargo ve gerçek kullanıcı ağı bu testte yoktur. Paylaşılan makinedeki diğer işler ve Docker kaynakları sonucu etkileyebilir; başka makine/runner ile sayıları doğrudan karşılaştırmayın.
- Ham k6 JSONL, k6 özeti, işlenmiş JSON ve kaynak örnekleri ölçüm oturumunun çalışma alanında arşivlenmiştir; repo içinde değildir. Token içeren geçici fixture ve test sunucuları koşu sonrası temizlenmiştir.
