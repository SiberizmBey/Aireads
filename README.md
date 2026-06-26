<div align="center">
  <img src="./assets/img/aireads.png" alt="Aireads Logo" width="120" />
  <h1>🚀 Aireads</h1>
  <p><strong>Modern, hızlı ve dinamik bir Threads klonu.</strong></p>

  <p>
    <a href="#özellikler">Özellikler</a> •
    <a href="#kurulum">Kurulum</a> •
    <a href="#kullanım">Kullanım</a> •
    <a href="#teknolojiler">Teknolojiler</a>
  </p>
</div>

---

## 📸 Ekran Görüntüleri

Projeye ait ekran görüntülerini aşağıda bulabilirsiniz. Masaüstü ve mobil görünümler desteklenmektedir.

### 🏠 Ana Sayfa & Keşfet
<div align="center">
  <img src="./screenshots/desktop_home.png" alt="Masaüstü Ana Sayfa" width="45%" />
</div>
<div align="center">
  <img src="./screenshots/mobile_home.png" alt="Mobil Ana Sayfa" width="22%" />
</div>

### 👤 Profil
<div align="center">
  <img src="./screenshots/desktop_profile.png" alt="Masaüstü Profil" width="45%" />
</div>
<div align="center">
  <img src="./screenshots/mobile_profile.png" alt="Mobil Profil" width="22%" />
</div>

### ✍️ Yeni Gönderi & ⚙️ Ayarlar
<div align="center">
  <img src="./screenshots/desktop_newpost.png" alt="Masaüstü Yeni Gönderi" width="45%" />
  <img src="./screenshots/desktop_settings.png" alt="Masaüstü Ayarlar" width="45%" />
</div>
<div align="center">
  <img src="./screenshots/mobile_newpost.png" alt="Mobil Yeni Gönderi" width="22%" />
  <img src="./screenshots/mobile_settings.png" alt="Mobil Ayarlar" width="22%" />
</div>

### 🔐 Giriş / Kayıt Sayfası
<div align="center">
  <img src="./screenshots/desktop_login.png" alt="Masaüstü Giriş" width="60%" />
</div>
<div align="center">
  <img src="./screenshots/mobile_login.png" alt="Mobil Giriş" width="22%" />
</div>

<br/>

## ✨ Özellikler

- **Gelişmiş Profil Yönetimi:** Kullanıcı arama (`/api/users/search`), takip etme/bırakma, takipçi ve takip edilen sayılarını görüntüleme.
- **Dinamik Akış (Feed):** "Sana Özel" ve "Takip Ettiklerin" olmak üzere sekmeli gönderi akışı.
- **Gerçek Zamanlı İletişim (Socket.io):** 
  - Anlık Direct Message (DM) sistemi.
  - Yeni takip, beğeni veya mesaj geldiğinde anlık bildirimler.
- **Etkileşimli Gönderiler:** 
  - Gönderi paylaşma, beğenme/beğenmekten vazgeçme ve zincirleme (thread) yanıtlar verebilme.
  - Multer ile 5MB'a kadar resim yükleme desteği.
- **Kullanıcı Kimlik Doğrulaması:** Giriş, kayıt, çıkış ve oturum yönetimi (Bcrypt ile şifreleme ve express-session).
- **Veri Silme:** Kullanıcının hesabını sildiğinde `ON DELETE CASCADE` ile tüm verilerini (avatar, gönderiler, takipler, DM'ler, beğeniler) temizleyen SQLite altyapısı.


---

## 🛠️ Kurulum

Projeyi yerel ortamınızda çalıştırmak için aşağıdaki adımları izleyin.

### Gereksinimler

- [Node.js](https://nodejs.org/) (v16 veya daha yeni bir sürüm)
- [NPM](https://www.npmjs.com/) (Node.js ile birlikte gelir)

### Adımlar

1. **Repoyu Klonlayın**
   ```bash
   git clone https://github.com/SiberizmBey/Aireads.git
   cd aireads
   ```

2. **Bağımlılıkları Yükleyin**
   ```bash
   npm install
   ```

3. **Veritabanı Dosyasını Oluşturun**
   Proje ana dizininde bir `database.sqlite` dosyası oluşturulmalı. Otomatik oluşmamışsa elle oluşturabilirsiniz. Veritabanı bağlantı ayarlarını `database.js` dosyasında kontrol edebilirsiniz.

---

## 🚀 Kullanım

Kurulum tamamlandıktan sonra uygulamayı başlatmak için:

### Geliştirme Modu
Uygulamayı geliştirme modunda başlatmak için:
```bash
npm run dev
```

### Üretim Modu
Uygulamayı normal şekilde başlatmak için:
```bash
npm start
```

Uygulama başarıyla başlatıldığında tarayıcınızdan **`http://localhost:3000`** adresine giderek erişebilirsiniz.

---

## 💻 Teknolojiler

Bu proje aşağıdaki modern web teknolojileri kullanılarak geliştirilmiştir:

- **Backend:** Node.js, Express.js
- **Veritabanı:** SQLite / PostgreSQL (pg)
- **Gerçek Zamanlı:** Socket.io
- **Kimlik Doğrulama & Oturum:** bcryptjs, express-session
- **Dosya Yükleme:** Multer

---

<div align="center">
  <i>Siberizm tarafından Vibe Coding ile geliştirildi.</i>
</div>
