# Performans risk raporu (QA-036)

Bu rapor, yerel performans ölçümlerinde hedef tutmayan sonuçları tek yerde toplar. Amaç yalnızca "geçti/kaldı" listesi değil, her başarısızlığın nedenini, kanıtını ve sonraki adımını dürüstçe kaydetmektir. Hedefler yerel öğrenme hedefleridir; üretim SLA'sı değildir.

## 1. Hedefler ve kaynaklar

- Liste ve sepet adımları: p95 ≤ 500 ms.
- Checkout ve ödeme adımları: p95 ≤ 1.000 ms.
- Senaryo hata oranı: < %1.
- Ölçüm: k6, üç bağımsız koşu, 60 sn ramp-up, 180 sn 10 VU, 30 sn ramp-down. Kaynak: [performance-baseline-2026-11-14.md](./performance-baseline-2026-11-14.md), [performance-order-pagination-2026-11-16.md](./performance-order-pagination-2026-11-16.md), [performance-sql-analysis-2026-11-14.md](./performance-sql-analysis-2026-11-14.md), [performance-frontend-lab-2026-11-16.md](./performance-frontend-lab-2026-11-16.md).

## 2. Hedef durumu

Durum, üç koşunun **p95 ortancası** (baseline tablosu) ile belirlenmiştir.

| Senaryo / adım | p95 ortanca (ms) | Hedef (ms) | Durum | Neden / not |
|---|---:|---:|---|---|
| catalog | 20.1 | 500 | Tutuldu | Sayfalı katalog, hata yok |
| catalog_search | 16.2 | 500 | Tutuldu | Arama ve filtre hedefte |
| orders_10 (10 sipariş) | 221.2 | 500 | Tutuldu (ortanca) | 1. koşu 605.9 ms ile hedef dışı; marjinal |
| orders_100 (100 sipariş) | 4582.0 | 500 | **Tutulmadı** | Sipariş listesi sayfalanmamış sürüm; N+1 ve tüm listeyi yükleme |
| orders_1000 (1.000 sipariş) | 44234.9 | 500 | **Tutulmadı** | Aynı kök neden; büyük veri setinde ölçeklenmiyor |
| seller | 529.4 | 500 | **Tutulmadı** (küçük fark) | Satıcı liste sorgusu; hedefin yaklaşık %6 üstünde |
| checkout / cart_read | 22.2 | 500 | Tutuldu | — |
| checkout / cart_add | 47.6 | 500 | Tutuldu | — |
| checkout / checkout | 103.4 | 1.000 | Tutuldu | — |
| checkout / payment_create | 46.8 | 1.000 | Tutuldu | — |
| checkout / payment_complete | 81.1 | 1.000 | Tutuldu | — |

Hata oranı: tüm koşularda %0,00 (hedef < %1 tutuldu).

## 3. Başarısız hedefler ve nedenleri

### 3.1 Sipariş geçmişi (orders_100, orders_1000)

- **Kanıt:** 100 siparişte p95 ≈ 4,6 sn; 1.000 siparişte p95 ≈ 44 sn. Hata oranı %0; yani yanıtlar doğru ama yavaş.
- **Neden:** [SQL analizi](./performance-sql-analysis-2026-11-14.md) buyer, admin ve seller listelerinde N+1 örüntüsünü kanıtladı: sorgu sayısı sonuç sayısıyla büyüyor (buyer `1 + 6N`, seller `3 + 2N`, admin `1 + 7N`). Analiz ayrıca toplu yüklemenin (IN gruplarına bölünmüş sorgular) bu sayıyı düşürdüğünü, ancak sayfalamasız tam listenin hâlâ büyük veride yavaş kaldığını gösteriyor.
- **Düzeltme:** Sayfalı endpoint `GET /api/v1/orders/page?limit=20&offset=0` eklendi; QA-026 ölçümünde 1.000 sipariş için 20'lik sayfa ölçüldü ([performance-order-pagination-2026-11-16.md](./performance-order-pagination-2026-11-16.md)).
- **Durum:** Sayfalı yol temiz commit'te [üç kez tekrar ölçüldü](./performance-order-pagination-2026-11-16.md#qa-042--temiz-commit-üzerinde-tekrar-23-kasım-2026); ilk sayfada her koşu hedefte. Eski tam liste hâlâ sınırsızdır ve deprecated işaretlenerek sayfalı yola geçiş başlatılmıştır; kaldırma/sınırlama için tarih belirlenmemiştir.
- **Sınır:** İlk ölçümün çalışma ağacı temiz değildi; temiz commit tekrarı yalnız ilk sayfayı ölçer. Tam geçmişin performansını veya derin sayfaları doğrulamaz.

### 3.2 Satıcı listesi (seller)

- **Kanıt:** p95 ortanca 529,4 ms (hedef 500 ms). Üç koşunun tamamı 500 ms'in üzerinde değil; ortanca hedef dışı.
- **Neden (kısmen kanıtlı):** SQL analizinde seller sorgusu sıralamada `Seq Scan → top-N heapsort` kullanıyor (taranan 1.110 satır; 50 satır döndürülüyor) ve fulfillment kalem/olayları için N+1 sorguları çalışıyor. Bu, 529 ms ortancasının bir kısmını açıklayabilir; tam ayrıştırma ölçülmedi.
- **Güncel durum:** Bu 529,4 ms ölçümü toplu yükleme öncesine aittir. Toplu yükleme sonrasında önceki üç koşu hedefteydi; [QA-043 temiz commit tekrarında](./performance-load-after-sql-2026-11-15.md#qa-043--satıcı-yükünün-temiz-commit-tekrarı-24-kasım-2026) p95 24,86/23,03/25,69 ms ve hata oranı %0 ölçüldü. [Ayrı tekil indeks planı](./performance-sql-analysis-2026-11-14.md#qa-043--satıcı-sorgusu-ve-indeks-değerlendirmesi-24-kasım-2026) HTTP p95 kazancını kanıtlamaz; yeni indeks eklenmedi.

### 3.3 Sipariş 10 kayıt (orders_10) — marjinal

- Üç koşunun ortancası 221,2 ms (hedef içinde), ancak 1. koşu 605,9 ms. Bu yüzden "tutuldu" yerine "marjinal" olarak izlenir.

## 4. Ölçüm güvenilirliği sınırları

- Ölçümler tek bir Windows dizüstü bilgisayarda (Intel i5-10300H, 4 çekirdek) yapıldı; k6 ve API aynı makinede, PostgreSQL Docker Desktop'ta çalıştı. Gerçek sunucu ortamıyla karşılaştırılamaz.
- Yük profili düşük (10 VU); üretim eşzamanlılığı değildir.
- Frontend ölçümü (QA-027) OIDC ve ağ koşullarına duyarlıdır; sepet erteleme denemesi hedefleri karşılamadı ([performance-frontend-lab-2026-11-16.md](./performance-frontend-lab-2026-11-16.md)).

## 5. Sonraki adımlar (öncelik sırasıyla)

1. Deprecated eski tam sipariş listesi kullanan istemcilerin geçişini değerlendirmek; kaldırma veya sınırlama için ayrı uyumluluk ve sürüm kararı almak. Eski yol korunurken performans sorunu çözülmüş sayılmaz.
2. Gerektiğinde derin sayfa ve tüm geçmişi sayfalarla dolaşma maliyetini ayrı ölçmek; temiz commit üzerinde ilk sayfa tekrarı tamamlandı.
3. Daha büyük ve farklı satıcı dağılımlarında gerektiğinde indeks ve derin offset maliyetini yeniden ölçmek; mevcut tek satıcılı profilde hedef sağlandı.
4. Frontend ilk yük için kök neden ölçümü (QA-027, duraklatıldı).

## 6. Kabul özeti

| Ölçüt | Sonuç |
|---|---|
| Her hedef için tutuldu/tutulmadı/neden satırı | Yapıldı (bölüm 2 ve 3) |
| Hata oranı hedefi | Tutuldu (%0,00) |
| Açık nedenler kayıtlı | Evet |
| Ölçüm sınırları belirtildi | Evet (bölüm 4) |
