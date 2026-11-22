# BR-003 — Erişilebilirlik testi tek bütçede çok iş yaparak zaman aşımına uğruyordu

- **Tür:** Test kararlılığı (flaky) hatası
- **Önem:** Orta — sporadik kırmızı build, güveni azaltır
- **Ortam:** Playwright, Chromium, `apps/web/e2e/accessibility.spec.ts` (QA-023, `@smoke`)
- **Tespit:** Bir koşuda "Test timeout of 30000ms exceeded"; yeniden koşuda geçti.

## Adımlar

1. Tek testte buyer akışı (ana sayfa, adresler, sepet, siparişler), admin akışı (sipariş yönetimi, satıcı başvuruları) çalıştırıldı.
2. Her adımda axe taraması ve iki genişlikte (320px, 305px) reflow kontrolü yapıldı.

## Beklenen

Test, varsayılan 30 sn bütçesi içinde tamamlanır ve gerçek bir erişilebilirlik sorunu olduğunda başarısız olur.

## Gerçek

Test zaman aşımına uğradı. Hata bağlamı görünümün tamamen yüklendiğini gösterdi; yani sorun yükleme değil, toplam süredir.

## Kök neden

Tek testte birleşmiş iş yükü: çok sayıda axe taraması ve iki reflow kontrolü 30 sn bütçesini aşıyordu. İlk varsayım olan "yükleme beklemesi" kanıtla doğrulanmadı.

## Çözüm

- Test iki bağımsız teste bölündü: buyer ve admin.
- Admin testine açık 60 sn bütçe verildi.
- Admin satıcı başvuruları axe/reflow öncesi yükleme durumunun bitmesini bekler (`Başvurular yükleniyor...` kaybolur).

## Regresyon kanıtı

- Commit `5ce3d18`.
- `npm run test:e2e:smoke -- -g "QA-023"` 5 ardışık koşuda yeşil.

## Açık kalan

Gerçek flakiness oranı (5 koşu) düşük örneklem; gece CI'da izlenmeli.

## Öğrenilen

Zaman aşımında ilk varsayım (bekleme koşulu) yerine toplam iş yükünü ölçmek gerekir. Uzun E2E'ler kullanıcı akışına göre bölünmeli.
