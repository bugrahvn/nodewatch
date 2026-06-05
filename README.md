# 🖥️ NodeWatch — SaaS Uptime Monitor

NodeWatch, web sitelerinizin ve API'lerinizin erişilebilirliğini (uptime) gerçek zamanlı olarak izleyen, modern ve şık arayüze sahip **SaaS uyumlu bir Uptime Kontrol Platformudur**. Sistem, siteler çöktüğünde veya tekrar ayağa kalktığında Telegram botunuz aracılığıyla anlık bildirimler gönderir.

🌐 **Canlı Demo:** [nodewatch.armesbilisim.com](http://nodewatch.armesbilisim.com)

---

## 🚀 Öne Çıkan Özellikler

* **⏱️ Hassas Zamanlı Kontroller (Cron)**: Sitelerinizi 1, 5 veya 15 dakikalık periyotlarla arka planda otomatik olarak kontrol eder.
* **🤖 Kişisel Telegram Bot Entegrasyonu**: Her kullanıcı kendi Telegram Bot Token ve Chat ID bilgisini girerek kesinti ve düzelme anlarında anlık bildirimler alır.
* **🔒 Güvenli Veri Saklama (AES-256-CBC)**: Telegram Bot Token'ları veritabanında yüksek güvenlikli şifreleme algoritması kullanılarak saklanır.
* **📊 Gelişmiş Grafik Paneli**: Her sitenin son 24 ping kontrolüne ait tepki sürelerini (ms) Chart.js ile dinamik ve neon grafikler üzerinden gösterir.
* **📈 Son 30 Kontrol Geçiş Barı**: Sitelerin son durum geçmişini hızlıca inceleyebilmeniz için görsel durum barları sunar.
* **⚡ Manuel Anlık Ping**: İstediğiniz sitenin durumunu panelden tek tıkla o anda test edebilirsiniz.
* **👥 Çoklu Kullanıcı ve Süper Admin Yönetimi**:
  * Kullanıcılara özel site ekleme limitleri tanımlanabilir.
  * Kayıt olan ilk kullanıcı otomatik olarak `superadmin` yetkisi alır.
  * Süper Admin, tüm sistem istatistiklerini görebilir ve kullanıcı limitlerini yönetebilir.
* **📱 %100 Mobil Uyumlu Tasarım**: Hamburger menü, akıcı kayar kenar çubuğu ve duyarlı arayüz elementleri ile mobilde kusursuz deneyim sağlar.

---

## 🛠️ Teknoloji Yığını

* **Backend**: Node.js & Express
* **Database**: MySQL (Promise tabanlı havuz yönetimi)
* **Frontend**: EJS (Embedded JavaScript Templates), Vanilla CSS, Tailwind CSS (CDN), Chart.js
* **Bot Entegrasyonu**: Telegraf (Telegram Bot Framework)
* **Şifreleme**: Node.js `crypto` modülü (`aes-256-cbc`)

---

## ⚙️ Kurulum Rehberi

### Gereksinimler
* Node.js (v16 veya üzeri)
* MySQL Server (Yerel veya uzak sunucu)

### 1. Projeyi Klonlayın
```bash
git clone https://github.com/bugrahvn/nodewatch.git
cd nodewatch
```

### 2. Bağımlılıkları Yükleyin
```bash
npm install
```

### 3. Çevre Değişkenlerini Yapılandırın
Proje kök dizininde `.env` adında bir dosya oluşturun ve `.env.example` dosyasındaki şablona göre doldurun:

```env
# Sunucu Ayarları
PORT=3000
SESSION_SECRET=senin_guclu_session_anahtarin

# Veritabanı Ayarları
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=veritabani_sifreniz
DB_NAME=nodewatch

# Güvenlik ve Şifreleme (AES-256-CBC)
# ENCRYPTION_KEY tam olarak 32 karakter olmalıdır
ENCRYPTION_KEY=d3b07384d113edec49eaa6238ad5ff00
# ENCRYPTION_IV tam olarak 16 karakter olmalıdır
ENCRYPTION_IV=8f9e0d1c2b3a4f5e

# Varsayılan Süper Admin Ayarları (İlk kurulumda otomatik oluşturulur)
SUPERADMIN_USERNAME=admin
SUPERADMIN_PASSWORD=adminpassword

# Yeni kullanıcılar için varsayılan izleme limiti
DEFAULT_MONITOR_LIMIT=5
```

> [!IMPORTANT]
> `ENCRYPTION_KEY` ve `ENCRYPTION_IV` değerlerini üretim (production) ortamına geçmeden önce mutlaka kendinize özel rastgele karakterlerle güncelleyin!

### 4. Uygulamayı Başlatın
Uygulama çalıştırıldığında veritabanını (`nodewatch`) ve gerekli tüm tabloları otomatik olarak oluşturacaktır.

**Geliştirme Modu:**
```bash
npm run dev
```

**Üretim Modu:**
```bash
npm start
```

Tarayıcınızdan `http://localhost:3000` adresine giderek varsayılan admin bilgileri ile giriş yapabilirsiniz.

---

## 🤖 Telegram Bot Kurulumu

1. Telegram üzerinden `@BotFather` botu ile iletişime geçerek `/newbot` komutuyla yeni bir bot oluşturun ve size verilen **Bot Token** değerini kopyalayın.
2. Bildirim almak istediğiniz grup veya kişisel sohbetin **Chat ID** değerini öğrenin (Bunun için `@userinfobot` veya benzeri botları kullanabilirsiniz).
3. NodeWatch panelinizde **Telegram Bot** menüsüne gelin.
4. Token ve Chat ID bilgilerinizi girip kaydedin. Sistem otomatik olarak botu başlatacak ve size bir test mesajı gönderecektir.
5. Telegram üzerinden botunuza şu komutları gönderebilirsiniz:
   * `/status` - Sitelerinizin anlık durumunu ve tepki sürelerini raporlar.
   * `/ping` - Botun aktifliğini test eder.
   * `/help` - Komut listesini gösterir.

---

## 📂 Proje Yapısı

```text
nodewatch/
├── config/             # Veritabanı bağlantı havuzu ve şema doğrulaması
├── middleware/         # Yetkilendirme (Auth) ara yazılımları
├── routes/             # Rotalar (Giriş, Dashboard, Admin Paneli vb.)
├── services/           # Cron, Telegram Bot ve Kripto servisleri
├── views/              # EJS şablonları (HTML arayüzleri)
│   └── partials/       # Ortak şablon parçaları (Header, Footer)
├── app.js              # Uygulama başlangıç ve servis koordinasyon noktası
└── package.json        # Bağımlılık ve betik listesi
```

---

## 📄 Lisans
Bu proje [MIT](LICENSE) lisansı altında korunmaktadır.
