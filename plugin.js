/* UA MODS for Lampa
 * Version: 0.1.0
 * Standalone settings + connectivity helper.
 * Does not bundle third-party video scrapers or bypass paid subscriptions.
 */
(function () {
    'use strict';

    var PLUGIN = 'ua_mods';
    var VERSION = '0.1.0';
    var PREFIX = 'ua_mods_';
    var ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 5.5h16v10H4z" stroke="currentColor" stroke-width="1.7"/><path d="m10 8.5 5 2-5 2v-4Z" fill="currentColor"/><path d="M8 19h8M12 15.5V19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    var started = false;

    function get(key, fallback) {
        try {
            var value = Lampa.Storage.get(PREFIX + key);
            return value === undefined || value === null ? fallback : value;
        } catch (e) {
            return fallback;
        }
    }

    function set(key, value) {
        try { Lampa.Storage.set(PREFIX + key, value); } catch (e) {}
    }

    function notify(message) {
        try { Lampa.Noty.show('[UA MODS] ' + message); }
        catch (e) { console.log('[UA MODS]', message); }
    }

    function cleanUrl(value) {
        return String(value || '').trim().replace(/\/+$/, '');
    }

    function request(url, timeout, callback) {
        var xhr = new XMLHttpRequest();
        var finished = false;
        var startedAt = Date.now();

        function done(result) {
            if (finished) return;
            finished = true;
            callback(result);
        }

        try {
            xhr.open('GET', url, true);
            xhr.timeout = timeout || 7000;
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    done({
                        ok: xhr.status >= 200 && xhr.status < 400,
                        status: xhr.status,
                        ms: Date.now() - startedAt,
                        error: xhr.status ? '' : 'Нет HTTP-ответа (возможен CORS или сетевой запрет)'
                    });
                }
            };
            xhr.onerror = function () {
                done({ ok: false, status: xhr.status || 0, ms: Date.now() - startedAt, error: 'Ошибка сети или CORS' });
            };
            xhr.ontimeout = function () {
                done({ ok: false, status: 0, ms: Date.now() - startedAt, error: 'Тайм-аут' });
            };
            xhr.send();
        } catch (e) {
            done({ ok: false, status: 0, ms: Date.now() - startedAt, error: e.message || 'Ошибка запроса' });
        }
    }

    function testTorrServer() {
        var base = cleanUrl(get('torrserver', ''));
        if (!base) {
            notify('Сначала укажите адрес TorrServer в настройках UA MODS.');
            return;
        }
        notify('Проверяю TorrServer: ' + base);
        request(base, 7000, function (r) {
            if (r.ok) notify('TorrServer отвечает. HTTP ' + r.status + ', ' + r.ms + ' мс. Это проверка доступности веб-адреса, не тест воспроизведения.');
            else notify('Нет подтверждённого ответа TorrServer. ' + r.error + (r.status ? ' (HTTP ' + r.status + ')' : '') + '.');
        });
    }

    function runDiagnostics() {
        var targets = [
            { name: 'TorrServer', url: cleanUrl(get('torrserver', '')) },
            { name: 'Провайдер / API', url: cleanUrl(get('provider', '')) },
            { name: 'Прокси', url: cleanUrl(get('proxy', '')) }
        ].filter(function (item) { return !!item.url; });

        if (!targets.length) {
            notify('Нет адресов для проверки. Заполните адреса в настройках UA MODS.');
            return;
        }

        var results = [];
        var index = 0;

        notify('Запускаю диагностику ' + targets.length + ' адрес(ов)…');

        function next() {
            if (index >= targets.length) {
                var report = results.join('\n');
                set('last_report', report);
                notify('Диагностика завершена. ' + report.replace(/\n/g, ' | '));
                try {
                    if (Lampa.Input && Lampa.Input.edit) {
                        Lampa.Input.edit({ title: 'UA MODS — результат диагностики', value: report }, function () {});
                    }
                } catch (e) {}
                return;
            }

            var target = targets[index++];
            request(target.url, 7000, function (r) {
                results.push(target.name + ': ' + (r.ok ? 'OK' : 'ошибка') +
                    (r.status ? ' / HTTP ' + r.status : '') + ' / ' + r.ms + ' мс' +
                    (r.error ? ' / ' + r.error : ''));
                next();
            });
        }
        next();
    }

    function copyReport() {
        var report = get('last_report', 'Диагностика ещё не запускалась.');
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(report).then(function () { notify('Отчёт скопирован.'); }, function () { notify(report); });
            } else {
                notify(report);
            }
        } catch (e) { notify(report); }
    }

    function addParam(name, type, title, description, extra) {
        var config = {
            component: PLUGIN,
            param: { name: PREFIX + name, type: type, default: (extra && extra.default !== undefined) ? extra.default : '' },
            field: { name: title, description: description || '' }
        };
        if (extra) {
            if (extra.placeholder) config.param.placeholder = extra.placeholder;
            if (extra.values) config.param.values = extra.values;
            if (extra.onChange) config.onChange = extra.onChange;
            if (extra.onRender) config.onRender = extra.onRender;
        }
        Lampa.SettingsApi.addParam(config);
    }

    function addButton(name, title, description, action) {
        addParam(name, 'button', title, description, {
            onRender: function (item) {
                item.on('hover:enter click', action);
            }
        });
    }

    function registerSettings() {
        if (!Lampa.SettingsApi || !Lampa.SettingsApi.addComponent || !Lampa.SettingsApi.addParam) {
            console.log('[UA MODS] SettingsApi недоступен в этой сборке Lampa.');
            return;
        }

        Lampa.SettingsApi.addComponent({
            component: PLUGIN,
            name: 'UA MODS',
            icon: ICON
        });

        addParam('torrserver', 'input', 'Адрес TorrServer', 'Внешний сервер в локальной сети или интернете. Например: http://192.168.1.50:8090', { placeholder: 'http://192.168.1.50:8090' });
        addButton('test_torrserver', 'Проверить TorrServer', 'Проверяет доступность адреса с телевизора.', testTorrServer);

        addParam('provider', 'input', 'Адрес сервиса / API', 'Необязательный адрес вашего легального провайдера или собственного API. Сам по себе ввод адреса не добавляет каталог в Lampa.', { placeholder: 'https://provider.example/api' });
        addParam('provider_note', 'static', 'Подключение источников', 'Для платных сервисов используйте собственную подписку и официальный API/плагин провайдера. Универсального API для всех онлайн-кинотеатров нет.');

        addParam('iptv_playlist', 'input', 'Ссылка на IPTV M3U', 'Ссылка на ваш плейлист. Для воспроизведения установите официальный IPTV-плагин Lampa.', { placeholder: 'https://example.com/playlist.m3u' });
        addParam('iptv_epg', 'input', 'Ссылка на IPTV EPG (необязательно)', 'Ссылка на XMLTV/EPG, если её поддерживает ваш IPTV-плагин.', { placeholder: 'https://example.com/epg.xml' });
        addParam('iptv_note', 'static', 'Установка IPTV', 'Официальное расширение: https://cub.best/plugin/iptv. После установки настройте плейлист в его собственных параметрах.');

        addParam('proxy', 'input', 'URL прокси (необязательно)', 'Укажите только свой доверенный HTTPS-прокси. UA MODS сохраняет адрес и проверяет доступность; он не перенаправляет автоматически запросы других плагинов.', { placeholder: 'https://your-proxy.example/' });
        addParam('proxy_note', 'static', 'Важно о прокси', 'Прокси должен поддерживать нужный API и CORS. Не отправляйте через неизвестные прокси пароли, токены и данные подписок.');

        addButton('diagnostics', 'Запустить диагностику', 'Проверяет адреса, которые вы указали выше.', runDiagnostics);
        addButton('copy_report', 'Показать / скопировать отчёт', 'Показывает последний результат диагностики.', copyReport);
        addButton('reset', 'Сбросить настройки UA MODS', 'Удаляет сохранённые адреса и отчёт.', function () {
            ['torrserver', 'provider', 'iptv_playlist', 'iptv_epg', 'proxy', 'last_report'].forEach(function (key) { set(key, ''); });
            notify('Настройки UA MODS сброшены. Перезапустите Lampa.');
        });
    }

    function start() {
        if (started) return;
        started = true;
        try {
            registerSettings();
            console.log('[UA MODS] v' + VERSION + ' загружен.');
            notify('Плагин загружен. Настройки находятся в Настройки → Расширения → UA MODS.');
        } catch (e) {
            console.log('[UA MODS] Ошибка запуска:', e);
        }
    }

    if (window.appready) start();
    else if (window.Lampa && Lampa.Listener && Lampa.Listener.follow) {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') start();
        });
    } else {
        console.log('[UA MODS] Ожидание API Lampa…');
    }
})();
