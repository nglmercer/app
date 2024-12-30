const express = require('express');
const fs = require('fs');
const path = require('path');
const url = require('url');
const app = express();
const cors = require('cors');
const https = require('https');
const RTCMultiConnectionServer = require('rtcmulticonnection-server');

const credentials = {
    key: fs.readFileSync('keys/private.key'),
    cert: fs.readFileSync('keys/certificate.crt')
};
const server = https.createServer(credentials, app);
const io = require('socket.io')(server, {
    cors: {
        origin: '*', // Cambia a la URL de tu cliente
        methods: ['GET', 'POST'], // Métodos permitidos
        credentials: true // Habilitar credenciales
    }
});


const PORT = process.env.PORT || 9001;
const isUseHTTPs = false;

const jsonPath = {
    config: 'config.json',
    logs: 'logs.json'
};

const BASH_COLORS_HELPER = RTCMultiConnectionServer.BASH_COLORS_HELPER;
const getValuesFromConfigJson = RTCMultiConnectionServer.getValuesFromConfigJson;
const getBashParameters = RTCMultiConnectionServer.getBashParameters;
const resolveURL = RTCMultiConnectionServer.resolveURL;

let config = getValuesFromConfigJson(jsonPath);
config = getBashParameters(config, BASH_COLORS_HELPER);
app.use(cors({
    origin: '*', // Reemplaza con la URL de tu aplicación cliente
    methods: ['GET', 'POST'], // Métodos permitidos
    credentials: true // Si necesitas enviar cookies o credenciales
}));
// Middleware to handle config updates
app.use((req, res, next) => {
    config = getValuesFromConfigJson(jsonPath);
    config = getBashParameters(config, BASH_COLORS_HELPER);
    next();
});


// Handle admin access
app.use('/admin/*', (req, res, next) => {
    if (config.enableAdmin !== true) {
        return res.status(401).send('401 Unauthorized');
    }
    next();
});

// Main request handler
app.get('*', (req, res) => {
    let uri = url.parse(req.url).pathname;
    let filename = path.join(config.dirPath ? resolveURL(config.dirPath) : process.cwd(), uri);

    // Security check
    if (uri.indexOf('..') !== -1) {
        return res.status(401).send('401 Unauthorized: ' + path.join('/', uri));
    }

    // Handle special HTML files
    ['Video-Broadcasting', 'Screen-Sharing', 'Switch-Cameras'].forEach(fname => {
        if (filename.indexOf(fname + '.html') !== -1) {
            filename = filename.replace(fname + '.html', fname.toLowerCase() + '.html');
        }
    });

    try {
        const stats = fs.lstatSync(filename);

        // Handle directory requests
        if (stats.isDirectory()) {
            if (filename.indexOf(resolveURL('/demos/MultiRTC/')) !== -1) {
                filename = path.join(filename, 'index.html');
            } else if (filename.indexOf(resolveURL('/admin/')) !== -1) {
                filename = path.join(filename, 'index.html');
            } else if (filename.indexOf(resolveURL('/demos/dashboard/')) !== -1) {
                filename = path.join(filename, 'index.html');
            } else if (filename.indexOf(resolveURL('/demos/video-conference/')) !== -1) {
                filename = path.join(filename, 'index.html');
            } else if (filename.indexOf(resolveURL('/demos')) !== -1) {
                filename = path.join(process.cwd(), 'demos', 'index.html');
            } else {
                filename = path.join(process.cwd(), config.homePage);
            }
        }

        // Read and serve the file
        fs.readFile(filename, (err, file) => {
            if (err) {
                return res.status(404).send('404 Not Found: ' + path.join('/', uri));
            }

            let contentType = 'text/plain';
            if (filename.toLowerCase().endsWith('.html')) contentType = 'text/html';
            if (filename.toLowerCase().endsWith('.css')) contentType = 'text/css';
            if (filename.toLowerCase().endsWith('.png')) contentType = 'image/png';

            try {
                file = file.toString().replace(
                    'connection.socketURL = \'/\';',
                    `connection.socketURL = '${config.socketURL}';`
                );
            } catch (e) {}

            res.setHeader('Content-Type', contentType);
            res.send(file);
        });
    } catch (e) {
        res.status(404).send('404 Not Found: ' + path.join('/', uri));
    }
});

// Socket.io handling
io.on('connection', socket => {
    RTCMultiConnectionServer.addSocket(socket, config);

    const params = socket.handshake.query;
    if (!params.socketCustomEvent) {
        params.socketCustomEvent = 'custom-message';
    }

    socket.on(params.socketCustomEvent, message => {
        socket.broadcast.emit(params.socketCustomEvent, message);
    });
});

// Start server
RTCMultiConnectionServer.beforeHttpListen(server, config);
server.listen(PORT, process.env.IP || "0.0.0.0", () => {
    RTCMultiConnectionServer.afterHttpListen(server, config);
    console.log(`Servidor HTTPS ejecutándose en puerto ${PORT}`);
    console.log(`Socket.io escuchando en: https://localhost:${PORT}/`);
    console.log('Tu navegador web (archivo HTML) DEBE establecer esta línea:');
    console.log(`\tconnection.socketURL = "https://localhost:${PORT}/";`);
    if (config.enableAdmin) {
        console.log(`Página de administración habilitada en: https://localhost:${PORT}/admin/`);
        console.log('\tUsuario admin:', config.adminUserName);
        console.log('\tContraseña admin:', config.adminPassword);
    }
});