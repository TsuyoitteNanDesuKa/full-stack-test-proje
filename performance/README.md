# QA-026 API yük senaryoları

Bu araçlar yalnız yerel, izole test içindir; canlı veya mevcut geliştirme veritabanına uygulanmaz. PostgreSQL 17, Python/uv ve k6 gerektirir. k6 `v2.4.0` ile doğrulanmıştır. Senaryolar normal API kimlik doğrulamasını geçici RS256/JWKS ile kullanır; Keycloak giriş performansı ölçülmez. Checkout yerel mock ödemedir.

Ölçülecek varyantlar: `catalog`, `catalog_search`, `orders_10`, `orders_100`, `orders_1000`, `seller`, `checkout`. Seed: 1.000 ürün, 10/100/1.000 siparişli ayrı buyer, onaylı seller, sipariş başına iki kalem ve bir sipariş/bir fulfillment olayı. Checkout için ayrı buyer, adres ve ürünle 10 VU hazırlanır.

## Tek koşu hazırlığı (Windows PowerShell)

Depo kökünden çalıştırın. Portlar 15432, 18001 ve 18082 boş olmalıdır; zaten çalışan servisleri durdurmayın. Geçici dizinin erişimi yalnız mevcut kullanıcıya açık olmalıdır; `fixtures.json` dört saat geçerli test token'ları içerir. Dizin ve token'ları repoya, CI artefaktına veya paylaşımlı ortama koymayın.

```powershell
$work = Join-Path $env:TEMP ("liva-perf-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $work
$container = "liva-perf-" + [guid]::NewGuid().ToString("N")
docker run -d --rm --name $container -p 127.0.0.1:15432:5432 `
  -e POSTGRES_DB=shop_perf_test -e POSTGRES_USER=perf `
  -e POSTGRES_PASSWORD=local-perf-only postgres:17-alpine
docker exec $container pg_isready -U perf -d shop_perf_test
```

`pg_isready` başarılı olana kadar bekleyin. Docker komutu başarısızsa devam etmeyin. Bu container yalnız bu koşu için oluşturulur; mevcut Compose PostgreSQL ve volume'leri kullanılmaz.

```powershell
$env:SHOP_DATABASE_URL = "postgresql+psycopg://perf:local-perf-only@127.0.0.1:15432/shop_perf_test"
uv run --directory apps\api alembic upgrade head
uv run --directory apps\api python ..\..\performance\seed.py --output-dir $work
```

Seed yalnız `127.0.0.1`/`localhost:15432` üzerindeki `shop_perf_test` ve boş, migration uygulanmış uygulama şemasını kabul eder; mevcut veriyi temizlemez veya üzerine yazmaz. Bu kontrol tek başına ortamın güvenli olduğunu kanıtlamaz: yukarıdaki yeni container'ın kullanıldığını doğrulayın. Migration ve seed başarısızsa yükü başlatmayın.

Ayrı bir terminalde depo kökünden JWKS'yi başlatın; `$work` değerini ilk terminaldeki dizinle aynı yapın:

```powershell
$work = "<ilk terminaldeki geçici dizin>"
uv run --directory apps\api python ..\..\performance\serve_jwks.py (Join-Path $work "jwks.json")
```

Başka bir terminalde reload kapalı ve tek worker'lı API'yi başlatın:

```powershell
$env:SHOP_DATABASE_URL = "postgresql+psycopg://perf:local-perf-only@127.0.0.1:15432/shop_perf_test"
$env:SHOP_OIDC_ISSUER = "http://127.0.0.1:18082/realms/e2e"
$env:SHOP_OIDC_JWKS_URL = "http://127.0.0.1:18082/realms/e2e/protocol/openid-connect/certs"
uv run --directory apps\api uvicorn shop_api.main:create_app --factory --host 127.0.0.1 --port 18001 --workers 1
```

Her iki sunucunun hazır olduğunu doğrulayın:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:18001/openapi.json
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:18082/realms/e2e/protocol/openid-connect/certs
```

## Yük ve rapor

İlk terminalde, `k6` PATH'te olacak şekilde:

```powershell
$env:PERF_API_URL = "http://127.0.0.1:18001"
$env:PERF_FIXTURES = Join-Path $work "fixtures.json"
$env:PERF_SCENARIO = "catalog"
$env:PERF_REPORT = Join-Path $work "summary.json"
$env:PERF_SMOKE = "1" # Yalnız kısa kurulum/doğrulama koşusu; baseline değildir.
k6 run --out "json=$work\raw.jsonl" performance\load.js
python performance\report.py --summary "$work\summary.json" --raw "$work\raw.jsonl" `
  --output "$work\report.json" --scenario $env:PERF_SCENARIO --mode smoke
```

Gerçek baseline için `$env:PERF_SMOKE` değişkenini kaldırın ve rapor komutunda `--mode baseline` kullanın. Her varyant için **üç bağımsız koşu** yapın: önce API ve JWKS'yi durdurun, yalnız bu koşunun container'ını durdurun, yeni container/geçici dizin oluşturup migration/seed ve iki sunucuyu yeniden başlatın. JWT anahtarı her seed'de değiştiği için sunucuları yeniden başlatmak zorunludur. Her koşunun ham, k6 özet ve işlenmiş raporunu ayrı adla saklayın. Token süresi dolarsa yeni ortam oluşturun.

Profil: 60 sn ramp-up, 180 sn 10 VU, 30 sn ramp-down, iterasyon arası 1 sn bekleme. `PERF_SMOKE=1` 2/5/2 sn ve 2 VU kullanır; eşikleri doğrulamak içindir, baseline olarak yorumlanmaz. İstekler başlangıç zamanına göre faza ayrılır; rapor yalnız sabit yük fazında başlayan istekleri sayar. İstek throughput'u sabit faz istek sayısı / faz süresidir; sabit VU, sabit RPS demek değildir.

Rapor adım bazında durum kodları, hata sayısı, başarılı yanıt p50/p95/p99, yanıt boyutu ve gerçekleşen throughput'u verir. Hatalı iş sonucu, timeout ve beklenmeyen HTTP yanıtları başarısız sayılır; gecikme yalnız başarılı yanıtlar içindir. Eksik adım/örnek, tamamlanmamış koşu veya hedef aşımı non-zero çıkıştır ve raporda görünür. Senaryo/koşu başına örnek sayısı düşükse sonucu güvenilir kapasite tahmini olarak sunmayın. Ham metrikler URL veya Authorization etiketi içermez; yine de rapor ve logları paylaşmadan önce inceleyin.

Her koşuya commit, tarih, OS/CPU/RAM, API worker/sürüm ayarları, PostgreSQL/k6 sürümleri, yük üreticisinin konumu, diğer etkin yük ve veri profilini ayrıca kaydedin. Üç ayrı raporun sonuçlarını ve ortancasını karşılaştırın; eşik başarısızlıklarını saklamayın. CPU/bellek, SQL sorgu sayısı ve `EXPLAIN (ANALYZE, BUFFERS)` analizi ayrıca yapılır; bu araçlar bunları otomatik toplamaz.

## Temizlik

API ve JWKS terminallerini kendi çalıştırdığınız süreçlerde `Ctrl+C` ile kapatın. İlk terminalde yalnız yukarıda oluşturduğunuz container'ı durdurun (`--rm` ile container ve anonim volume kaldırılır):

```powershell
docker stop $container
Remove-Item -LiteralPath (Join-Path $work "fixtures.json"), (Join-Path $work "jwks.json")
```

Raporları gerekirse güvenli konuma taşıyın; geçici dizindeki yalnız bu koşuya ait dosyaları silin. Mevcut geliştirme verilerini veya başka container'ları silmeyin.
