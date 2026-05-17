const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

let folders = []; 

// Главная страница БЕЗ EJS (прямой вывод HTML, чтобы избежать белого экрана)
app.get('/', (req, res) => {
    try {
        const currentFolderId = req.query.folderId || null;
        const currentFolders = folders.filter(f => f.parentId === currentFolderId);
        
        let breadcrumbs = [];
        let parent = folders.find(f => f.id === currentFolderId);
        while(parent) {
            breadcrumbs.unshift(parent);
            parent = folders.find(f => f.id === parent.parentId);
        }

        let images = [];
        if (currentFolderId) {
            const dirPath = path.join(__dirname, 'public', 'uploads', currentFolderId);
            if (fs.existsSync(dirPath)) {
                images = fs.readdirSync(dirPath)
                    .filter(file => file.toLowerCase().endsWith('.jpg'))
                    .sort();
            }
        }

        // Генерируем HTML папок
        let foldersHtml = currentFolders.length === 0 ? '<p>Папок нет</p>' : '';
        currentFolders.forEach(f => {
            foldersHtml += `
                <div style="background: #2e2e2e; padding: 15px; border-radius: 6px; min-width: 150px; text-align: center;">
                    <a href="/?folderId=${f.id}" style="display: block; color: #f1c40f; text-shadow: none; font-weight: bold; margin-bottom: 10px; font-size: 18px; text-decoration: none;">📁 ${f.name}</a>
                    <form action="/rename-folder" method="POST" style="margin-bottom: 5px;">
                        <input type="hidden" name="folderId" value="${f.id}">
                        <input type="hidden" name="currentFolderId" value="${currentFolderId || ''}">
                        <input type="text" name="newName" placeholder="Новое имя" style="width: 100px;" required>
                        <button type="submit">✏️</button>
                    </form>
                    <form action="/delete-folder" method="POST">
                        <input type="hidden" name="folderId" value="${f.id}">
                        <input type="hidden" name="currentFolderId" value="${currentFolderId || ''}">
                        <button type="submit" style="background: #c0392b; color: white; border: none; padding: 3px 10px; cursor: pointer;">❌ Удалить</button>
                    </form>
                </div>
            `;
        });

        // Gенерируем HTML крошек
        let crumbsHtml = '<a href="/" style="color: #3498db; text-decoration: none;">Корневая папка</a>';
        breadcrumbs.forEach(crumb => {
            crumbsHtml += ` / <a href="/?folderId=${crumb.id}" style="color: #3498db; text-decoration: none;">${crumb.name}</a>`;
        });

        // Генерируем HTML картинок
        let imagesHtml = '';
        images.forEach(img => {
            imagesHtml += `<img src="/uploads/${currentFolderId}/${img}" style="width: 100%; height: auto; display: block; margin: 0; padding: 0; border: none;" alt="page">`;
        });

        // Отдаем готовую страницу
        res.send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <title>Временный менеджер комиксов</title>
                <style>
                    body { margin: 0; padding: 0; background: #121212; color: #e0e0e0; font-family: sans-serif; }
                    .sidebar { padding: 20px; background: #1e1e1e; border-bottom: 1px solid #333; }
                    .breadcrumbs { margin-bottom: 15px; font-size: 14px; }
                    .folder-list { display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 20px; }
                    .viewer { width: 100%; max-width: 800px; margin: 0 auto; display: flex; flex-direction: column; }
                </style>
            </head>
            <body>
                <div class="sidebar">
                    <div class="breadcrumbs">${crumbsHtml}</div>
                    <form action="/create-folder" method="POST" style="display: inline-block; margin-right: 20px;">
                        <input type="hidden" name="parentId" value="${currentFolderId || ''}">
                        <input type="text" name="name" placeholder="Имя новой папки" required>
                        <button type="submit">+ Создать папку</button>
                    </form>
                    ${currentFolderId ? `
                    <form action="/upload-zip" method="POST" enctype="multipart/form-data" style="display: inline-block;">
                        <input type="hidden" name="folderId" value="${currentFolderId}">
                        <input type="file" name="zipFile" accept=".zip" required>
                        <button type="submit">Загрузить ZIP</button>
                    </form>
                    ` : ''}
                    <form action="/clear-all" method="POST" style="float: right;">
                        <button type="submit" style="background: #c0392b; color: white; border: none; padding: 5px 10px; cursor: pointer;">Очистить сайт</button>
                    </form>
                </div>
                <div style="padding: 20px;">
                    <h3>Папки:</h3>
                    <div class="folder-list">${foldersHtml}</div>
                </div>
                <div class="viewer">${imagesHtml}</div>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send("Ошибка сервера: " + err.message);
    }
});

// Создание папки
app.post('/create-folder', (req, res) => {
    const { name, parentId } = req.body;
    const newFolder = {
        id: Date.now().toString(),
        name: name,
        parentId: parentId || null
    };
    folders.push(newFolder);
    res.redirect(parentId ? `/?folderId=${parentId}` : '/');
});

// Переименование
app.post('/rename-folder', (req, res) => {
    const { folderId, newName, currentFolderId } = req.body;
    const folder = folders.find(f => f.id === folderId);
    if (folder) folder.name = newName;
    res.redirect(currentFolderId ? `/?folderId=${currentFolderId}` : '/');
});

// Рекурсивное удаление
function deleteFolderRecursive(folderId) {
    const children = folders.filter(f => f.parentId === folderId);
    children.forEach(child => deleteFolderRecursive(child.id));
    const dirPath = path.join(__dirname, 'public', 'uploads', folderId);
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
    folders = folders.filter(f => f.id !== folderId);
}

app.post('/delete-folder', (req, res) => {
    const { folderId, currentFolderId } = req.body;
    deleteFolderRecursive(folderId);
    res.redirect(currentFolderId ? `/?folderId=${currentFolderId}` : '/');
});

// Распаковка ZIP
app.post('/upload-zip', upload.single('zipFile'), (req, res) => {
    const { folderId } = req.body;
    if (!req.file || !folderId) return res.status(400).send('Ошибка загрузки');

    const targetDir = path.join(__dirname, 'public', 'uploads', folderId);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    try {
        const zip = new AdmZip(req.file.path);
        const zipEntries = zip.getEntries();

        zipEntries.forEach(entry => {
            if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.jpg') && !entry.entryName.includes('__MACOSX')) {
                fs.writeFileSync(path.join(targetDir, entry.name), entry.getData());
            }
        });

        fs.unlinkSync(req.file.path);
        res.redirect(`/?folderId=${folderId}`);
    } catch (err) {
        res.status(500).send('Ошибка при распаковке ZIP');
    }
});

// Очистить всё
app.post('/clear-all', (req, res) => {
    folders = [];
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (fs.existsSync(uploadsDir)) {
        fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
    res.redirect('/');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));