# DAST bulgu triyajı ve istisna politikası (QA-044)

Bu belge, pasif DAST pilotunun (OWASP ZAP Baseline + OpenAPI GET-only güvenli mod) ürettiği bulguların triyajını ve doğrulanmış bulgular için istisna politikasını kaydeder. Tarama yalnız izole, geçici API/web/SQLite hedeflerini `--internal` Docker ağında tarar; üretim veya harici hedef, gerçek kullanıcı verisi ve aktif tarama kapsam dışıdır.

**Önemli:** Bu tarama güvenlik açığı yokluğunu kanıtlamaz. Rol/sahiplik API testlerinin, SCA taramalarının ve manuel güvenlik incelemesinin yerine geçmez.

## 1. Koşu özeti

| Koşu | Tarih | Commit | Hedef | Sonuç |
|---|---|---|---|---|
| Yerel pilot | 25 Kasım 2026 | — | Web + API (izole) | Web 7 URL / 5 uyarı; API 32 URL / 1 bilgilendirme |
| Uzak DAST #1 | 26 Kasım 2026 | `d15af6a` | Web + API | Başarılı; safety testleri, pasif tarama, `dast-reports` artefaktı (14 gün) |
| Kimlikli prototip (yerel) | 26 Kasım 2026 | `5fae7fb` | 7 buyer GET yolu | 7 URL %100 2xx; 12/12 birim test; tek bulgu `X-Content-Type-Options` |

Kimlikli tarama yalnız yedi allowlist GET yolunu tarar; admin/seller ve mutation işlemleri yoktur, `-S` ile aktif tarama atlanır. Token komut satırına, loga veya rapora yazılmaz.

## 2. Bulgu triyajı

Web raporundaki her uyarı incelendi. Beş uyarının tamamı **geçici Python statik sunucusuna** (`SimpleHTTP/0.6 Python/3.13.18`) ait başlık/keşif sorunlarıdır; uygulama kodundan veya API sunucusundan kaynaklanmaz. Üretim web sunucusu hakkında kanıt değildir.

| ID | Bulgu | Risk | Örnek | Değerlendirme | Karar |
|---|---|---|---|---|---|
| D-01 | Content-Security-Policy başlığı yok | Medium/High | 2 | Statik test sunucusu CSP göndermiyor; uygulama CSP'si üretim sunucusunda yapılandırılır | Yanlış pozitif (test ortamı) — kabul, istisna |
| D-02 | Anti-clickjacking (`X-Frame-Options`/CSP frame-ancestors) yok | Medium/Medium | 1 | Aynı nedenle test sunucusuna ait | Yanlış pozitif (test ortamı) — kabul, istisna |
| D-03 | `Server` sürüm bilgisi açığa çıkıyor | Low/High | 5 | `SimpleHTTP/0.6 Python/3.13.18` sürümü sızıyor; bilgi ifşası ama test ortamı | Yanlış pozitif (test ortamı) — kabul, istisna |
| D-04 | `X-Content-Type-Options` yok | Low/Medium | 4–5 | Test sunucusu başlığı; MIME sniffing riski ama ortam geçici | Yanlış pozitif (test ortamı) — kabul, istisna |
| D-05 | Modern SPA bilgilendirmesi | Informational | 1 | ZAP'ın SPA keşif sınırı hakkında bilgi notu; bulgu değil | Bilgilendirme — kapatıldı |
| D-06 | Anonim API `401` yanıtları | Informational | 18 | Token'sız isteklerde beklenen kimlik doğrulama reddi | Beklenen davranış — kapatıldı |
| D-07 | `mock-checkout` GET `404` | Informational | 1 | Yalnız geçerli ödeme oturumunda bulunan sayfa | Beklenen davranış — kapatıldı |

**Sonuç:** Doğrulanmış gerçek güvenlik açığı yok. Tüm web başlık uyarıları test ortamına özgüdür. Bu, "açık yok" kanıtı değildir; yalnız bu taramada bu bulguların gerçek ürün riski taşımadığı anlamına gelir.

## 3. İstisna ve başarısızlık politikası

1. **Kapsam:** İstisna yalnız doğrulanmış yanlış pozitifler için verilir. Doğrulanmamış bir bulgu istisnaya alınamaz; önce triyaj gerekir.
2. **Kayıt zorunluluğu:** Her istisna bu belgede bir ID ile yer alır ve şu alanları taşır: bulgu, risk, örnek sayısı, yanlış pozitif gerekçesi, sahip, istisna bitiş tarihi.
3. **Sona erme:** İstisnalar kalıcı değildir. Bu pilot kapsamında bitiş tarihi proje kapanışıdır; üretim ortamı devreye alınırsa tüm istisnalar sıfırlanır ve yeniden triyaj yapılır.
4. **Kapı davranışı:** Bulgu **yeni** ve doğrulanmışsa (istisna listesinde yoksa) DAST adımı başarısız olur. Ortam/tarayıcı hataları da başarısız olur. Yalnız listelenen istisnalar geçer.
5. **Onay:** Yeni istisna, API sahibi tarafından onaylanmadan eklenemez.
6. **Yerine geçmez:** DAST, rol/sahiplik API testlerinin, SCA taramalarının veya manuel incelemenin yerine geçmez.

## 4. Bilinen sınırlar

- Yalnız pasif tarama; aktif saldırı (`-S`) yok.
- Kimlikli tarama yalnız yedi buyer GET yolunu kapsar; admin/seller ve mutation yok.
- Hedefler geçici ve izole; üretim başlıkları, TLS, WAF ve gerçek kimlik sağlayıcı davranışı hakkında kanıt üretmez.
- Uzak DAST workflow'un kimlikli aşaması henüz çalıştırılıp doğrulanmadı (yalnız yerel prototip ve ilk uzak pasif koşu var).

## 5. Sonraki adım

- Uzak DAST workflow'unu bir kez `workflow_dispatch` ile çalıştırıp kimlikli aşamanın artefakt ürettiğini doğrulamak (açık iş, sahip: proje sahibi).
