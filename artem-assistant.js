/**
 * Артём — переиспользуемый геймифицированный ассистент для тренажёров.
 *
 * Подключение:
 *   <link rel="stylesheet" href="artem-assistant.css">
 *   <script src="artem-assistant.js"></script>
 *
 *   ArtemAssistant.init({
 *     idleImage: 'artem.png',          // аватар FAB
 *     waveGif: 'hello.gif',            // приветствие
 *     talkGif: 'talk.gif',             // говорение
 *     thumbsUpImage: 'artem-thumbs_up.png',
 *     name: 'Артём',
 *     intro: [ 'Привет! ...', 'Шутка...', 'Удачи! ...' ],
 *     completion: {
 *       text: 'Поздравляю! ...',
 *       returnUrl: 'https://lms.reso.ru/',
 *       returnLabel: 'Вернуться к обучению'
 *     },
 *     getHint: (taskIndex) => 'Подсказка...',
 *     onIntroComplete: () => { ... }
 *   });
 *
 *   // После прохождения всех заданий:
 *   ArtemAssistant.showCompletion();
 *
 *   // Блокировка ввода, пока открыт intro/complete/подсказка:
 *   if (ArtemAssistant.isOpen()) return;
 */
(function (global) {
  'use strict';

  /* Режимы анимации персонажа во вступлении */
  const POSE = {
    WAVE: 'wave', /* приветствие — hello.gif */
    TALK: 'talk'  /* говорение — talk.gif */
  };

  const DEFAULTS = {
    idleImage: 'artem.png',
    waveGif: 'hello.gif',
    talkGif: 'talk.gif',
    thumbsUpImage: 'artem-thumbs_up.png',
    name: 'Артём',
    intro: [],
    completion: {
      text: 'Поздравляю! Ты освоил тему. Удачи в дальнейшем обучении!',
      returnUrl: 'https://lms.reso.ru/',
      returnLabel: 'Вернуться к обучению'
    },
    typeSpeed: 28,
    linePause: 400,
    getHint: null,
    onIntroComplete: null
  };

  let config = {};
  let introIndex = 0;
  let typeTimer = null;
  let hintOpen = false;
  let currentTaskIndex = 0;

  let els = {};

  function clearTypeTimer() {
    if (typeTimer) {
      clearTimeout(typeTimer);
      typeTimer = null;
    }
  }

  /** Переключить GIF-позу: приветствие (wave) или говорение (talk) */
  function setIntroPose(pose) {
    const sprite = els.introSprite;
    if (!sprite) return;

    sprite.classList.remove('artem-pose-wave', 'artem-pose-talk');
    sprite.classList.add(pose === POSE.WAVE ? 'artem-pose-wave' : 'artem-pose-talk');
  }

  /** Предзагрузка GIF во вступлении — параллельно, до показа модалки */
  function preloadIntroGifs() {
    const urls = [config.waveGif, config.talkGif].filter(Boolean);
    if (!urls.length) return Promise.resolve();

    return Promise.all(
      urls.map(
        (src) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = resolve;
            img.src = src;
          })
      )
    );
  }

  function applyIntroGifSources() {
    const sprite = els.introSprite;
    if (!sprite) return;

    const waveGif = sprite.querySelector('.artem-wave-gif');
    const talkGif = sprite.querySelector('.artem-talk-gif');
    if (waveGif && config.waveGif) waveGif.src = config.waveGif;
    if (talkGif && config.talkGif) talkGif.src = config.talkGif;
  }

  function typeText(targetEl, text, speed, onDone) {
    clearTypeTimer();
    targetEl.innerHTML = '';

    let i = 0;
    const cursor = document.createElement('span');
    cursor.className = 'artem-cursor';
    targetEl.appendChild(cursor);

    function tick() {
      if (i < text.length) {
        const ch = text.charAt(i);
        const node = document.createTextNode(ch);
        targetEl.insertBefore(node, cursor);
        i++;
        typeTimer = setTimeout(tick, speed);
      } else {
        cursor.remove();
        if (onDone) onDone();
      }
    }

    tick();
  }

  function buildDOM() {
    const intro = document.createElement('div');
    intro.className = 'artem-intro-overlay';
    intro.id = 'artemIntro';
    intro.innerHTML =
      '<div class="artem-intro-layout">' +
        '<div class="artem-intro-stage">' +
          '<div class="artem-intro-cluster">' +
            '<div class="artem-sprite artem-sprite-hero artem-pose-wave" id="artemIntroSprite">' +
              '<img class="artem-wave-gif" alt="" draggable="false">' +
              '<img class="artem-talk-gif" alt="" draggable="false">' +
            '</div>' +
            '<div class="artem-intro-side">' +
              '<div class="artem-bubble-wrap">' +
                '<div class="artem-bubble artem-bubble-intro">' +
                  '<span class="artem-bubble-name"></span>' +
                  '<span class="artem-bubble-text" id="artemIntroText"></span>' +
                '</div>' +
              '</div>' +
              '<div class="artem-intro-actions">' +
                '<button type="button" class="artem-btn artem-btn-ghost" id="artemIntroSkip">Пропустить</button>' +
                '<button type="button" class="artem-btn artem-btn-primary" id="artemIntroNext" disabled>Далее</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    const complete = document.createElement('div');
    complete.className = 'artem-intro-overlay artem-complete-overlay';
    complete.id = 'artemComplete';
    complete.innerHTML =
      '<div class="artem-intro-layout">' +
        '<div class="artem-intro-stage">' +
          '<div class="artem-intro-cluster">' +
            '<div class="artem-sprite artem-sprite-hero artem-pose-static" id="artemCompleteSprite">' +
              '<img class="artem-static" alt="" draggable="false">' +
            '</div>' +
            '<div class="artem-intro-side">' +
              '<div class="artem-bubble-wrap">' +
                '<div class="artem-bubble artem-bubble-intro">' +
                  '<span class="artem-bubble-name"></span>' +
                  '<span class="artem-bubble-text" id="artemCompleteText"></span>' +
                '</div>' +
              '</div>' +
              '<div class="artem-intro-actions artem-complete-actions">' +
                '<button type="button" class="artem-btn artem-btn-ghost" id="artemCompleteRestart" hidden>Пройти заново</button>' +
                '<a class="artem-btn artem-btn-primary artem-btn-link" id="artemCompleteLink" href="#">Вернуться к обучению</a>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    const hintPopup = document.createElement('div');
    hintPopup.className = 'artem-hint-popup';
    hintPopup.id = 'artemHintPopup';
    hintPopup.innerHTML =
      '<div class="artem-bubble" style="padding-right:36px">' +
        '<button type="button" class="artem-hint-close" id="artemHintClose" aria-label="Закрыть">×</button>' +
        '<span class="artem-bubble-name"></span>' +
        '<span class="artem-bubble-text" id="artemHintText"></span>' +
      '</div>';

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'artem-fab';
    fab.id = 'artemFab';
    fab.title = 'Спросить Артёма';
    fab.setAttribute('aria-label', 'Подсказка от Артёма');
    fab.innerHTML =
      '<span class="artem-fab-circle">' +
        '<span class="artem-fab-pulse"></span>' +
        '<span class="artem-fab-avatar"><img alt="Артём" draggable="false"></span>' +
        '<span class="artem-fab-badge">?</span>' +
      '</span>' +
      '<span class="artem-fab-label">Артем, помоги!</span>';

    document.body.appendChild(intro);
    document.body.appendChild(complete);
    document.body.appendChild(hintPopup);
    document.body.appendChild(fab);

    els = {
      intro,
      introText: document.getElementById('artemIntroText'),
      introNext: document.getElementById('artemIntroNext'),
      introSkip: document.getElementById('artemIntroSkip'),
      introSprite: document.getElementById('artemIntroSprite'),
      complete,
      completeText: document.getElementById('artemCompleteText'),
      completeLink: document.getElementById('artemCompleteLink'),
      completeRestart: document.getElementById('artemCompleteRestart'),
      hintPopup,
      hintText: document.getElementById('artemHintText'),
      hintClose: document.getElementById('artemHintClose'),
      fab
    };

    intro.querySelectorAll('.artem-bubble-name').forEach((el) => {
      el.textContent = config.name;
    });
    complete.querySelector('.artem-bubble-name').textContent = config.name;
    hintPopup.querySelector('.artem-bubble-name').textContent = config.name;

    /* GIF-источники выставляются после предзагрузки, до показа вступления */
    setIntroPose(POSE.WAVE);
    complete.querySelector('.artem-static').src = config.thumbsUpImage;
    fab.querySelector('.artem-fab-avatar img').src = config.idleImage;

    const completion = config.completion || {};
    els.completeLink.href = completion.returnUrl || DEFAULTS.completion.returnUrl;
    els.completeLink.textContent = completion.returnLabel || DEFAULTS.completion.returnLabel;
    if (completion.restartLabel && typeof completion.onRestart === 'function') {
      els.completeRestart.hidden = false;
      els.completeRestart.textContent = completion.restartLabel;
      els.completeRestart.addEventListener('click', function () {
        els.complete.classList.remove('visible');
        completion.onRestart();
      });
    }

    els.introNext.addEventListener('click', advanceIntro);
    els.introSkip.addEventListener('click', finishIntro);
    els.fab.addEventListener('click', toggleHint);
    els.hintClose.addEventListener('click', closeHint);
    document.addEventListener('keydown', onKeyDown);
  }

  function onKeyDown(e) {
    if (!els.intro.classList.contains('visible')) return;
    if (e.key === 'Enter' && !els.introNext.disabled) {
      e.preventDefault();
      advanceIntro();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      finishIntro();
    }
  }

  function showIntroLine() {
    const lines = config.intro;
    if (!lines.length || introIndex >= lines.length) {
      finishIntro();
      return;
    }

    /* Первая реплика — приветствие (wave), остальные — говорение (talk) */
    setIntroPose(introIndex === 0 ? POSE.WAVE : POSE.TALK);

    els.introNext.disabled = true;
    const text = typeof lines[introIndex] === 'string' ? lines[introIndex] : lines[introIndex].text;

    typeText(els.introText, text, config.typeSpeed, () => {
      els.introNext.disabled = false;
      const isLast = introIndex >= lines.length - 1;
      els.introNext.textContent = isLast ? 'Поехали! 🚀' : 'Далее →';
    });
  }

  function launchSparkSalute() {
    const btn = els.introNext;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    const container = document.createElement('div');
    container.className = 'artem-spark-salute';
    container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(container);

    const colors = ['#fff9c4', '#ffd54f', '#ff9800', '#ffffff', '#a5d6a7', '#81c784', '#fff'];
    const maxDist = Math.min(window.innerWidth, window.innerHeight) * 0.48;

    /* Круговой салют: искры во все стороны по дуге, заполняя экран */
    for (let i = 0; i < 130; i++) {
      const spark = document.createElement('div');
      spark.className = 'artem-spark';

      const angle = Math.random() * Math.PI * 2;
      const radius = maxDist * (0.35 + Math.random() * 0.65);
      const vx = Math.cos(angle) * radius;
      const vy = Math.sin(angle) * radius;
      const size = 2 + Math.random() * 5;
      const delay = Math.random() * 0.12;
      const duration = 0.75 + Math.random() * 0.65;

      spark.style.left = originX + 'px';
      spark.style.top = originY + 'px';
      spark.style.setProperty('--vx', vx + 'px');
      spark.style.setProperty('--vy', vy + 'px');
      spark.style.setProperty('--color', colors[Math.floor(Math.random() * colors.length)]);
      spark.style.setProperty('--delay', delay + 's');
      spark.style.setProperty('--duration', duration + 's');
      spark.style.setProperty('--size', size + 'px');

      container.appendChild(spark);
    }

    setTimeout(() => container.remove(), 2400);
  }

  function advanceIntro() {
    if (els.introNext.disabled) return;
    const isLastLine = introIndex >= config.intro.length - 1;
    if (isLastLine) {
      launchSparkSalute();
      introIndex++;
      setTimeout(finishIntro, 350);
      return;
    }
    introIndex++;
    setTimeout(showIntroLine, config.linePause);
  }

  function finishIntro() {
    clearTypeTimer();
    els.intro.classList.remove('visible');
    els.fab.classList.add('visible');
    if (typeof config.onIntroComplete === 'function') {
      config.onIntroComplete();
    }
  }

  function startIntro() {
    if (config.skipIntro) {
      els.fab.classList.add('visible');
      if (typeof config.onIntroComplete === 'function') config.onIntroComplete();
      return;
    }
    if (!config.intro.length) {
      els.fab.classList.add('visible');
      if (typeof config.onIntroComplete === 'function') config.onIntroComplete();
      return;
    }
    introIndex = 0;
    els.introNext.textContent = 'Далее →';
    setIntroPose(POSE.WAVE);
    els.intro.classList.add('visible');
    showIntroLine();
  }

  function closeHint() {
    hintOpen = false;
    clearTypeTimer();
    els.hintPopup.classList.remove('visible');
  }

  function toggleHint() {
    if (hintOpen) {
      closeHint();
      return;
    }

    const hint =
      typeof config.getHint === 'function'
        ? config.getHint(currentTaskIndex)
        : 'Пока нечего подсказать — задание уже выполнено!';

    if (!hint) {
      closeHint();
      return;
    }

    hintOpen = true;
    els.hintPopup.classList.add('visible');
    typeText(els.hintText, hint, config.typeSpeed);
  }

  function showCompletion() {
    closeHint();
    if (els.fab) els.fab.classList.remove('visible');

    const completion = config.completion || {};
    const text = completion.text || DEFAULTS.completion.text;

    els.complete.classList.add('visible');
    typeText(els.completeText, text, config.typeSpeed);
  }

  function boot(gifPreload) {
    buildDOM();
    gifPreload.then(() => {
      applyIntroGifSources();
      startIntro();
    });
  }

  const ArtemAssistant = {
    init(userConfig) {
      config = Object.assign({}, DEFAULTS, userConfig || {});
      if (userConfig && userConfig.completion) {
        config.completion = Object.assign({}, DEFAULTS.completion, userConfig.completion);
      }
      const gifPreload = preloadIntroGifs();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => boot(gifPreload));
      } else {
        boot(gifPreload);
      }
    },

    setTaskIndex(index) {
      currentTaskIndex = index;
      if (hintOpen) closeHint();
    },

    showHint() {
      if (!els.fab) return;
      closeHint();
      toggleHint();
    },

    showCompletion,

    hide() {
      closeHint();
      if (els.intro) els.intro.classList.remove('visible');
      if (els.complete) els.complete.classList.remove('visible');
      if (els.fab) els.fab.classList.remove('visible');
    },

    showFab() {
      if (els.fab) els.fab.classList.add('visible');
    },

    isOpen() {
      if (!els.intro) return false;
      return (
        els.intro.classList.contains('visible') ||
        (els.complete && els.complete.classList.contains('visible')) ||
        hintOpen
      );
    }
  };

  global.ArtemAssistant = ArtemAssistant;
})(typeof window !== 'undefined' ? window : this);
