# Manuel erişilebilirlik inceleme planı (QA-037)

Bu plan, otomatik erişilebilirlik kontrollerinin (axe, klavye E2E) kapsamadığı alanlar için ekran okuyucu ile manuel incelemeyi tanımlar. Otomasyon yalnızca WCAG'nin makine ile ölçülebilen kısmını yakalar; anlamlı okunma sırası, duyuru zamanlaması ve bağlam kararları insan incelemesi gerektirir.

## 1. Kapsam

**Kapsam içinde:** Yerel uygulama (`http://localhost:5173`), tarayıcı Chrome veya Edge, NVDA ekran okuyucu, Windows.

**Kapsam dışı:** Mobil ekran okuyucular (TalkBack, VoiceOver), JAWS ve macOS, gerçek kullanıcı testi (UAT). Bunlar ayrı bir karardır.

## 2. Ne otomatik, ne manuel?

| Konu | Otomatik kapsam | Manuel gerekçe |
|---|---|---|
| Axe WCAG 2.1 A/AA ihlalleri | Var (QA-017, QA-023) | — |
| Klavye ile erişim ve görünür odak | Kısmen (P2 buyer yolu, QA-017 giriş) | Odak sırasının anlamlı olup olmadığı |
| Ekran okuyucu duyuruları (`role="status"`, `role="alert"`) | Yok | Duyurunun zamanı ve metni manuel doğrulanmalı |
| Başlık hiyerarşisi ve bölge gezintisi | Kısmen (axe) | Okuyucunun bölge listesi anlamlı mı |
| Form hatalarının okunması | Yok | Hata metninin alanla ilişkilendirilmesi |
| Dinamik içerik (yükleme durumları) | Yok | "Yükleniyor" duyurusunun okunması |

## 3. Senaryolar (NVDA)

Her senaryo için: kısa beklenen okuma metni, kabul ölçütü ve kayıt alanı.

| ID | Ekran / akış | Adımlar | Kabul ölçütü |
|---|---|---|---|
| NV-01 | Giriş ekranı | Sayfayı aç; başlıklar ve "Giriş yap" düğmesini gezin | Başlık ve düğme rolü ve adı doğru okunur |
| NV-02 | Giriş hatası | Boş ya da hatalı giriş dene | Hata `role="alert"` ile hemen duyurulur |
| NV-03 | Kayıt formu | Alanları Tab ile gez | Her alanın etiketi ve zorunluluk durumu okunur |
| NV-04 | Ürün kataloğu | Ürün satırlarını ve "Sepete ekle" düğmelerini gez | Her satır ürün adını ve eylemi ayırt edilebilir okutur |
| NV-05 | Ürün detay (REQ-020) | Detay sayfasına geç; "Sepete ekle" ve "Kataloğa dön" | Geçiş sonrası başlık odağı ve okunur |
| NV-06 | Sepet paneli | Sepeti aç; miktar alanı (`Miktar: <ürün>`), "Sepetten kaldır" ve ödeme | Miktar alanı ürün adıyla birlikte okunur; kaldır düğmesi ürün adını içerir |
| NV-07 | Sepete ekleme duyurusu | "Sepete ekle" (ürün detay) | "Ürün sepetine eklendi." `role="status"` ile duyurulur |
| NV-08 | Adres defteri | Adres ekle formunu doldur ve gönder | Hata ve başarı duyuruları okunur |
| NV-09 | Sipariş geçmişi | Siparişleri aç; durum geçmişi listesi | Sipariş numarası ve durum listesi doğru okunur |
| NV-10 | Admin sipariş yönetimi | Durum güncelle; "İptal/iade nedeni" alanı ve "İptal et ve yerel iade kaydı oluştur" | Hata ve bildirim duyuruları (`role="alert"`/`role="status"`) okunur |
| NV-11 | Satıcı başvuruları (admin) | Liste, yükleme durumu, boş durum | "Başvurular yükleniyor..." ve boş durum duyurulur |
| NV-12 | Modal ya da açılır paneller | Sepet ve adres defteri açma/kapama | `aria-expanded` durumu değişimi okunur |

## 4. Yürütme

- **Kim:** Projeyi geliştiren kişi (tek kişilik öğrenme projesi); bağımsız inceleme önerilir ama zorunlu değildir.
- **Ne zaman:** Her büyük UI değişikliğinden sonra ve sürüm öncesinde bir kez. Bu planın ilk uygulaması ROADMAP'te bir tarihe bağlanır.
- **Ortam:** Yerel Docker Compose (`postgres`, `keycloak`, `mailpit`) ve API + web. Test hesabı yerel Keycloak kullanıcısıdır.
- **Süre tahmini:** Tüm senaryolar için yaklaşık 60–90 dakika.

## 5. Kayıt formatı

Her koşu için bir dosya: `docs/accessibility-runs/AAAA-GG-SS-nvda.md`.

```text
Tarih:
Tarayıcı / sürüm:
NVDA sürüm:
Uygulama commit:

| ID | Sonuç (Geçti / Kaldı / Kısmen) | Okunan metin (kısa) | Not / ekran görüntüsü |
|---|---|---|---|
| NV-01 | | | |
...

Bulgular (her biri için ID, adım, beklenen, gerçek, şiddet):
```

Kaldı veya kısmen sonuçlar bir hata raporu (`docs/bug-reports/`) ile izlenir.

## 6. Kabul ölçütleri

- Plan kayıtlı; 12 senaryonun tamamı tanımlı.
- İlk koşu tamamlanınca NV-01–NV-12 sonuçları kayda geçer (henüz yapılmadı).
- Her "Kaldı" bulgusu için bir hata raporu veya ROADMAP maddesi açılır.

## 7. Durum

- Plan: hazır.
- İlk manuel koşu: **yapılmadı**. Bu bir ölçüm değildir; sonuç uydurulmamıştır.
- Sürüm notlarında "manuel erişilebilirlik incelemesi yapılmamıştır" sınırı geçerlidir.
