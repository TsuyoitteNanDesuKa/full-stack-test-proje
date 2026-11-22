# Sözleşme testi genişletme kararı (QA-039)

## Karar

**Pact benzeri consumer-driven contract testing bu projeye şimdi eklenmeyecek.** Mevcut üç katmanlı sözleşme doğrulaması (OpenAPI snapshot + sunucu yanıt şeması + istemci çağrı kontrolü) bu projenin boyutu ve ekip yapısı için yeterli kabul edilir. Karar, aşağıdaki tetikleyiciler gerçekleşirse yeniden değerlendirilecek.

## Mevcut sözleşme katmanları (kanıt)

| Katman | Ne kontrol eder | Nerede | CI'da nerede koşar |
|---|---|---|---|
| 1. OpenAPI snapshot drift | Üretilen şema `docs/openapi.json` ile birebir aynı mı; üretim deterministik mi | `apps/api/scripts/openapi_contract.py --check`, `tests/test_openapi_contract.py` | PR (`backend`) |
| 2. Sunucu yanıtı şema doğrulaması | Temsilci API yanıtları snapshot şemasına jsonschema (Draft 2020-12) ile uyuyor mu | `apps/api/tests/test_response_contract.py` | PR (`backend`) |
| 3. İstemci çağrı kontrolü | İstemcinin çağırdığı her yol, yöntem ve başlık snapshot'ta tanımlı mı | `apps/web/src/api.openapi.test.ts` | PR (`frontend`) |
| 4. İstemci tip üretimi | `openapi-typescript-codegen` ile üretilen tipler güncel mi | `npm run contract:check` | PR (`frontend`) |

Bu katmanlar, ROADMAP QA-016 ve QA-022 maddelerinde kapatılmıştır.

## Pact'in çözdüğü, bizim çözmediğimiz problem

Pact, **tüketici (istemci) beklentilerinin ayrı bir sözleşme dosyası olarak yazılıp sağlayıcıya (API) doğrulanmasını** sağlar. Bizde:
- Tek tüketici var (`apps/web`), tek sağlayıcı var (`apps/api`), ikisi aynı monorepo içinde ve aynı PR'da değişir.
- İstemci tipleri OpenAPI snapshot'tan üretilir; yani "tüketici beklentisi" zaten sağlayıcı şemasından türetilmiş.

Bu yüzden Pact'in temel değeri (bağımsız dağıtılan, farklı ekiplerin tükettiği servisler arasında kırılma yakalama) bu projede henüz yok.

## Neden şimdi eklenmiyor

1. **Maliyet/fayda:** Pact broker, sağlayıcı durum (provider state) kurulumu ve iki ayrı sözleşme deposu bakım yükü getirir. Tek sahipli bir öğrenme projesinde bu yük, yakalayacağı hatalardan büyük olur.
2. **Çift kaynak riski:** OpenAPI ve Pact aynı davranışı iki yerde tanımlamaya başlar; bu, katman 1–4'te zaten var olan tek-doğruluk kaynağı ilkesini bozar.
3. **Kapsam:** Projede mock ödeme ve yerel akışlar var; dış tüketici yok.

## Yeniden değerlendirme tetikleyicileri

Aşağıdakilerden biri gerçekleşirse bu karar yeniden açılır:
- Bir ikinci tüketici eklenir (ör. mobil istemci ya da ortak entegrasyon).
- İstemci ve API ayrı depolara veya ayrı sürümlendirilmiş paketlere taşınır.
- Sağlayıcı, istemciden bağımsız olarak dağıtılmaya başlar (ayrı release takvimi).
- Mevcut OpenAPI snapshot kontrolleri, bir üretim sürümünde kırılma yakalayamaz hale gelirse.

## Bilinen sınır

Mevcut katmanlar **yalnızca temsilci yanıtları** kontrol eder; her hata yolu (ör. her 4xx gövdesi) ve her kombinasyon kapsanmaz. Bu boşluk kabul edilmiştir; hata yolları için ayrı negatif API testleri (`test_*` dosyaları) bu açığı kısmen kapatır.

## Kabul

- Karar ve gerekçe `docs/` altında kayıtlı (bu belge).
- Mevcut sözleşme katmanları kanıtlarıyla listelendi.
- Yeniden değerlendirme tetikleyicileri tanımlandı.
