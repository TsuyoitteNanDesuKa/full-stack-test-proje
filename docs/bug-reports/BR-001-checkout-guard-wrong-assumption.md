# BR-001 — Checkout koruma testi, sepet UI önkoşulunu atlıyor

- **Tür:** Test tasarım riski (kanıtlanmış bir kırmızı/yeşil hatası yok)
- **Önem:** Düşük-orta — koruma davranışı testi gerçek kullanıcı yolunu kanıtlamıyor
- **Ortam:** Frontend, Vitest + Testing Library, `apps/web/src/App.checkout-guard.test.tsx`
- **Tespit:** Kod incelemesi sırasında. Test dosyası doğrulandı; kırmızı çıktı kaydı YOK.

## Adımlar

1. `App` render edilir; buyer oturumu ve boş adres listesi mock'lanır.
2. `CartPanel` modülü mock'lanır; mock, "Force checkout" düğmesi ve hata alanı içerir.
3. Test doğrudan "Force checkout" düğmesine tıklar.

## Beklenen

Gerçek kullanıcı, sepeti açıp checkout'a basar; adres yoksa "önce bir teslimat adresi ekle veya seç" uyarısı görünür ve `/api/v1/orders` çağrılmaz.

## Gerçek

Test, sepet açma adımını (`Sepet (n)`) hiç yapmaz ve gerçek `CartPanel`'i değil mock'u kullanır. Koruma mantığı doğru sınanır ama UI akışı ve gerçek checkout düğmesi kanıtlanmaz.

## Kök neden

Mock sınırı, testi gerçek kullanıcı yolundan ayırdı. Bu, "geçen test ≠ çalışan akış" riskidir.

## Çözüm önerisi (uygulanmadı)

- Gerçek `CartPanel` ile, önce `Sepet (n)` düğmesini açan bir senaryo eklemek; mock'u sadece ağ sınırında kullanmak.
- Bu, ayrı bir iş olarak ROADMAP'e eklenmelidir; bu raporda kod değişikliği yapılmadı.

## Regresyon kanıtı

- Mevcut test dosyası, yukarıdaki beklenen davranışı (adres yoksa uyarı, `/api/v1/orders` yok) doğrular.
- Kırmızı çıktı kaydı yok; bu nedenle regresyon kanıtı "davranış doğrulandı", "hata yeniden üretildi" değildir.

## Öğrenilen

Bileşen mock'u kullanıldığında, kullanıcı önkoşullarının (paneli açma) ayrıca doğrulanması gerekir.
