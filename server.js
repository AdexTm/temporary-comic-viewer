const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' }); // Временная папка для загрузки самого ZIP

// Жесткая настройка путей для Render.com
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.urlencoded({ extended: true }));

// Хранилище структуры папок в оперативной памяти
let folders = []; 
// Структура объекта папки: { id: "123", name: "Название", parentId: null }

// Главная страница
app.get('/', (req, res) => {
    const currentFolderId = req.query.folderId || null;
    
    // Фильтруем папки, которые находятся в текущей директории
    const currentFolders = folders.filter(f => f.parentId === currentFolderId);
    
    // Ищем путь (хлебные крошки), чтобы можно было вернуться назад
    let breadcrumbs = [];
    let parent = folders.find(f => f.id === currentFolderId);
    while(parent) {
        breadcrumbs.unshift(parent);
        parent = folders.find(f => f.id === parent.parentId);
    }

    // Проверяем, есть ли картинки в текущей папке
    let images = [];
    if (currentFolderId) {
        const dirPath = path.join(__dirname, 'public', 'uploads', currentFolderId);
        if (fs.existsSync(dirPath)) {
            images = fs.readdirSync(dirPath)
                .filter(file => file.toLowerCase().endsWith('.jpg'))
                .sort(); // Сортировка по возрастанию (001, 002...)
        }
    }

    res.render('index', {
        folders: currentFolders,
        currentFolderId: currentFolderId,
        breadcrumbs: breadcrumbs,
        images: images
    });
});

// Создание папки
app.post('/create-folder', (req, res) => {
    const { name, parentId } = req.body;
    const newFolder = {
        id: Date.now().toString(), // Простая генерация ID
        name: name,
        parentId: parentId || null
    };
    folders.push(newFolder);
    res.redirect(parentId ? `/?folderId=${parentId}` : '/');
});

// Переименование папки
app.post('/rename-folder', (req, res) => {
    const { folderId, newName, currentFolderId } = req.body;
    const folder = folders.find(f => f.id === folderId);
    if (folder) folder.name = newName;
    res.redirect(currentFolderId ? `/?folderId=${currentFolderId}` : '/');
});

// Рекурсивное удаление папок и их содержимого
function deleteFolderRecursive(folderId) {
    // Находим детей
    const children = folders.filter(f => f.parentId === folderId);
    children.forEach(child => deleteFolderRecursive(child.id));

    // Удаляем физические картинки
    const dirPath = path.join(__dirname, 'public', 'uploads', folderId);
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }

    // Удаляем из массива в памяти
    folders = folders.filter(f => f.id !== folderId);
}

// Удаление папки
app.post('/delete-folder', (req, res) => {
    const { folderId, currentFolderId } = req.body;
    deleteFolderRecursive(folderId);
    res.redirect(currentFolderId ? `/?folderId=${currentFolderId}` : '/');
});

// Загрузка и распаковка ZIP
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
                // Сохраняем файл под его оригинальным именем (например, 001.jpg)
                const fileData = entry.getData();
                fs.writeFileSync(path.join(targetDir, entry.name), fileData);
            }
        });

        // Удаляем временный zip архив
        fs.unlinkSync(req.file.path);
        res.redirect(`/?folderId=${folderId}`);
    } catch (err) {
        res.status(500).send('Ошибка при распаковке ZIP');
    }
});

// Удалить ВСЕ данные на сайте вручную
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