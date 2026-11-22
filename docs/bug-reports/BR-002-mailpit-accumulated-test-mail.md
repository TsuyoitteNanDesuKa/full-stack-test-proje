# BR-002 — Mailpit'te birikmiş eski test e-postaları yanlış bağlantıya yol açma riski

- **Tür:** Test altyapısı hatası (risk olarak yakalandı)
- **Önem:** Yüksek — yanlış bağlantı kullanılırsa yanlış sonuç (sahte geçiş/kalma) üretir
- **Ortam:** Yerel Keycloak + Mailpit (`docker compose`), REQ-019 E2E (`apps/web/e2e/email-verification-reset.spec.ts`)
- **Tespit:** Ardışık koşularda Mailpit'te birden çok "Verify email" ve "Reset password" mesajı birikti (oturum gözlemi: Mailpit API `total` 26 ve 37; sayılar bu oturumda ölçüldü, kalıcı kayıt değil).

## Adımlar

1. REQ-019 E2E birkaç kez koşturuldu; her koşu Keycloak'tan yeni e-posta üretti.
2. Mailpit silinmediği için aynı alıcıya ait eski mesajlar listede kaldı.
3. Test, alıcı adresine göre ilk eşleşen mesajdan bağlantı okuyordu.

## Beklenen

Her doğrulama/sıfırlama adımı, o adım için üretilmiş en yeni e-postanın bağlantısını kullanır; eski, süresi dolmuş veya kullanılmış bağlantı asla seçilmez.

## Gerçek (risk)

Liste sırası belirsizdi; eski bağlantı seçilebilirdi. Bu, testin amacına ters bir yeşil sonuç üretebilirdi (eski bağlantı zaten kullanılmış olduğu için beklenmeyen davranış).

## Kök neden

Test verisi izolasyonu yoktu: Mailpit koşular arasında temizlenmiyordu ve seçim kuralı "en yeni" değil "ilk eşleşen" idi.

## Çözüm

- `recipientEmailLink` yalnızca alıcı + konu eşleşen mesajlar arasından `Created` değerine göre en yeni olanı seçer.
- Test sonrası ve koşu öncesi Mailpit temizliği uygulandı (37 → 0, 6 → 0 gözlemlendi).

## Regresyon kanıtı

- REQ-019 E2E 6/6 geçti (temiz Mailpit ile).
- Seçim kuralı spec kodunda açıkça yorumlanmıştır (`Take the most recent matching message`).

## Açık kalan

Mailpit temizliği şu an manuel adım; koşu öncesi otomatik temizlik eklenmedi. Gece CI'da Mailpit `docker compose` ile ephemeral başlatıldığı için birikme riski CI'da düşük; yerel geliştirmede risk sürer. Doğrulama: CI'da Mailpit mesaj sayısı loglanmalı (açık iş).

## Öğrenilen

Dış servisteki birikmiş durum, E2E'de sessiz yanlış sinyal üretebilir; seçim kuralı "en yeni" ve veri temizliği birlikte olmalı.
