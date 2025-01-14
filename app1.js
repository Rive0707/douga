document.addEventListener("DOMContentLoaded", () => {
  const videoFileInput = document.getElementById("videoFile");
  const subtitleFileInput = document.getElementById("subtitleFile");
  const videoPlayer = document.getElementById("videoPlayer");
  const subtitleList = document.getElementById("subtitleList");
  const playbackModeSelect = document.getElementById("playbackMode");
  const currentSubtitleText = document.getElementById("currentSubtitleText");
  const videoFileLabel = document.getElementById("videoFileLabel");
  const subtitleFileLabel = document.getElementById("subtitleFileLabel");
  const learningButtons = document.querySelectorAll(".learning-buttons button");
  const inputText = document.getElementById("inputText"); // 翻訳フォームの参照を追加

  // Translation related constants
  const apiKey = "46d5fa2c-100f-46b7-9cb3-654a744b3e71:fx";
  const TRANSLATION_DELAY = 500;
  let translationCache = new Map();
  let translationTimeout = null;

  let subtitles = [];
  let currentSubtitleIndex = null;
  let playbackMode = "manual";
  let stopPlaybackTimeout = null;
  let selectedWord = null;

  // Translation function with caching
  async function translateText(text) {
    if (!text.trim()) return "";

    if (translationCache.has(text)) {
      return translationCache.get(text);
    }

    const apiUrl = `https://api-free.deepl.com/v2/translate?auth_key=${apiKey}&text=${encodeURIComponent(
      text
    )}&target_lang=JA`;

    try {
      const response = await fetch(apiUrl);
      const result = await response.json();

      if (response.ok) {
        const translation = result.translations[0].text;
        translationCache.set(text, translation);
        return translation;
      } else {
        throw new Error("Translation failed");
      }
    } catch (error) {
      console.error("Translation error:", error);
      return "翻訳エラー";
    }
  }

  // LocalStorage word state management functions
  function saveWordState(word, state) {
    const wordStates = JSON.parse(localStorage.getItem("wordStates") || "{}");
    wordStates[word.toLowerCase()] = state;
    localStorage.setItem("wordStates", JSON.stringify(wordStates));
  }

  function getWordState(word) {
    const wordStates = JSON.parse(localStorage.getItem("wordStates") || "{}");
    return wordStates[word.toLowerCase()];
  }

  // Video file selection
  videoFileInput?.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
      const fileType = file.type || "video/x-matroska";
      const videoSource = document.getElementById("videoSource");
      videoSource.src = URL.createObjectURL(file);
      videoSource.type = fileType;
      videoPlayer.load();

      videoFileLabel.style.display = "none";
      videoFileInput.style.display = "none";
      subtitleFileLabel.style.display = "block";
      subtitleFileInput.style.display = "block";
    }
  });

  // Subtitle file selection
  subtitleFileInput?.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        const text = await file.text();
        subtitles = parseSubtitles(text);
        if (subtitles.length === 0) {
          throw new Error("No valid subtitles found");
        }
        console.log(`Parsed ${subtitles.length} subtitles`);
        displaySubtitleList();

        subtitleFileLabel.style.display = "none";
        subtitleFileInput.style.display = "none";
      } catch (error) {
        console.error("Error loading subtitles:", error);
        alert("字幕ファイルの読み込みに失敗しました。");
      }
    }
  });

  // Enhanced SVO parsing function
  function parseSVO(text) {
    const cleanText = text.replace(/<[^>]+>/g, "").trim();
    const sentences = cleanText.split(/[.!?]+/).filter((s) => s.trim());
    const result = [];

    sentences.forEach((sentence) => {
      const words = sentence.trim().split(/\s+/);
      let currentChunk = [];
      let chunkType = "subject";

      words.forEach((word) => {
        const lowerWord = word.toLowerCase();
        const subjects = [
          "i",
          "you",
          "he",
          "she",
          "it",
          "we",
          "they",
          "this",
          "that",
          "who",
          "which",
        ];
        const verbs = [
          "is",
          "are",
          "was",
          "were",
          "have",
          "has",
          "had",
          "do",
          "does",
          "did",
          "go",
          "goes",
          "went",
          "see",
          "sees",
          "saw",
          "make",
          "makes",
          "made",
          "take",
          "takes",
          "took",
          "get",
          "gets",
          "got",
          "know",
          "knows",
          "knew",
          "want",
          "wants",
          "wanted",
          "use",
          "uses",
          "used",
          "find",
          "finds",
          "found",
          "tell",
          "tells",
          "told",
          "ask",
          "asks",
          "asked",
          "work",
          "works",
          "worked",
          "seem",
          "seems",
          "seemed",
          "feel",
          "feels",
          "felt",
          "try",
          "tries",
          "tried",
          "leave",
          "leaves",
          "left",
          "call",
          "calls",
          "called",
        ];

        if (subjects.includes(lowerWord)) {
          if (currentChunk.length > 0) {
            result.push({ type: chunkType, text: currentChunk.join(" ") });
            currentChunk = [];
          }
          currentChunk.push(word);
          chunkType = "subject";
        } else if (verbs.includes(lowerWord)) {
          if (currentChunk.length > 0) {
            result.push({ type: chunkType, text: currentChunk.join(" ") });
            currentChunk = [];
          }
          currentChunk.push(word);
          chunkType = "verb";
        } else {
          if (chunkType === "verb") {
            if (currentChunk.length > 0) {
              result.push({ type: chunkType, text: currentChunk.join(" ") });
              currentChunk = [];
            }
            chunkType = "object";
          }
          currentChunk.push(word);
        }
      });

      if (currentChunk.length > 0) {
        result.push({ type: chunkType, text: currentChunk.join(" ") });
      }
    });

    return result;
  }

  function createSVOSpanWithTranslation(chunk) {
    const container = document.createElement("span");
    container.classList.add("word-container");

    const wordSpan = document.createElement("span");
    wordSpan.textContent = chunk.text;
    wordSpan.classList.add("word", chunk.type);

    const state = getWordState(chunk.text.toLowerCase()) || "unlearned";
    wordSpan.classList.add(state);

    const translationSpan = document.createElement("span");
    translationSpan.classList.add("hover-translation");
    translationSpan.textContent = "";

    container.appendChild(wordSpan);
    container.appendChild(translationSpan);

    // ホバーイベントの追加
    container.addEventListener("mouseenter", () => {
      // 翻訳フォームに自動入力
      if (inputText) {
        inputText.value = chunk.text;
        inputText.focus();
      }
    });

    // クリックイベントの追加（単語の状態切り替え用）
    wordSpan.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleWordState(wordSpan, chunk.text);
    });

    return container;
  }

  // Display subtitle list
  function displaySubtitleList() {
    subtitleList.innerHTML = "";

    subtitles.forEach((subtitle, index) => {
      const li = document.createElement("li");
      li.dataset.index = index;

      const svoChunks = parseSVO(subtitle.text);
      svoChunks.forEach((chunk) => {
        const container = createSVOSpanWithTranslation(chunk);
        li.appendChild(container);
        li.appendChild(document.createTextNode(" "));
      });

      li.addEventListener("click", () => handleSubtitleClick(index));
      subtitleList.appendChild(li);
    });
  }

  // Display current subtitle
  async function displayCurrentSubtitle(text) {
    currentSubtitleText.innerHTML = "";
    const subtitleContent = document.createElement("div");
    subtitleContent.classList.add("subtitle-content");

    const originalTextDiv = document.createElement("div");
    originalTextDiv.classList.add("original-text");

    const svoChunks = parseSVO(text);
    svoChunks.forEach((chunk) => {
      const container = createSVOSpanWithTranslation(chunk);
      originalTextDiv.appendChild(container);
      originalTextDiv.appendChild(document.createTextNode(" "));
    });

    subtitleContent.appendChild(originalTextDiv);
    currentSubtitleText.appendChild(subtitleContent);
  }

  // Subtitle click handler
  function handleSubtitleClick(index) {
    if (!subtitles[index]) {
      console.warn("Invalid subtitle index:", index);
      return;
    }

    const subtitle = subtitles[index];
    if (playbackMode === "manual") {
      if (stopPlaybackTimeout) {
        clearTimeout(stopPlaybackTimeout);
      }
      videoPlayer.currentTime = subtitle.start;
      videoPlayer.play();

      stopPlaybackTimeout = setTimeout(() => {
        videoPlayer.pause();
      }, (subtitle.end - subtitle.start) * 1000);
    } else {
      videoPlayer.currentTime = subtitle.start;
      videoPlayer.play();
    }

    highlightSubtitle(index);
  }

  function parseSubtitles(content) {
    try {
      const subtitleBlocks = content.trim().split(/\r?\n\r?\n/);
      const parsedSubtitles = [];

      for (let block of subtitleBlocks) {
        const lines = block.split(/\r?\n/);

        // 最低3行（インデックス、時間、テキスト）必要
        if (lines.length < 3) continue;

        // 時間行のパース
        const timeMatch = lines[1].match(
          /(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/
        );
        if (!timeMatch) continue;

        // テキスト行の結合（3行目以降すべて）
        const text = lines.slice(2).join(" ").trim();

        parsedSubtitles.push({
          index: parseInt(lines[0]) || parsedSubtitles.length + 1,
          start: timeToSeconds(timeMatch[1]),
          end: timeToSeconds(timeMatch[2]),
          text: text,
        });
      }

      console.log("Parsed subtitles:", parsedSubtitles); // デバッグ用
      return parsedSubtitles;
    } catch (error) {
      console.error("字幕のパースエラー:", error);
      return [];
    }
  }

  // 時間文字列を秒数に変換する関数は既存のまま使用
  // ...existing code...

  function timeToSeconds(timeStr) {
    const [time, ms] = timeStr.split(",");
    const [hours, minutes, seconds] = time.split(":");
    return (
      parseInt(hours) * 3600 +
      parseInt(minutes) * 60 +
      parseInt(seconds) +
      parseInt(ms) / 1000
    );
  }

  function highlightSubtitle(index) {
    if (currentSubtitleIndex !== null) {
      const prevElement = subtitleList.children[currentSubtitleIndex];
      if (prevElement) {
        prevElement.classList.remove("active");
      }
    }

    const currentElement = subtitleList.children[index];
    if (currentElement) {
      currentElement.classList.add("active");
      currentElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }

    const subtitle = subtitles[index];
    if (subtitle) {
      displayCurrentSubtitle(subtitle.text);
    }

    currentSubtitleIndex = index;
  }

  function toggleWordState(span, word) {
    const states = ["unlearned", "learning", "learned"];
    const currentState =
      states.find((state) => span.classList.contains(state)) || "unlearned";
    const nextState =
      states[(states.indexOf(currentState) + 1) % states.length];

    updateAllSameWords(word.toLowerCase(), nextState);
    saveWordState(word.toLowerCase(), nextState);
  }

  function updateAllSameWords(targetWord, newState) {
    const allWordSpans = document.querySelectorAll(
      "#subtitleList .word, #currentSubtitleText .word"
    );

    allWordSpans.forEach((span) => {
      if (span.textContent.toLowerCase() === targetWord.toLowerCase()) {
        const states = ["unlearned", "learning", "learned"];
        states.forEach((state) => span.classList.remove(state));
        span.classList.add(newState);
      }
    });
  }

  // Event listeners
  playbackModeSelect.addEventListener("change", (event) => {
    playbackMode = event.target.value;
  });

  videoPlayer.addEventListener("timeupdate", () => {
    const currentTime = videoPlayer.currentTime;
    const currentSubtitle = subtitles.find(
      (subtitle) => currentTime >= subtitle.start && currentTime <= subtitle.end
    );

    if (currentSubtitle) {
      const index = subtitles.indexOf(currentSubtitle);
      if (index !== currentSubtitleIndex) {
        highlightSubtitle(index);
      }
    }
  });
});
