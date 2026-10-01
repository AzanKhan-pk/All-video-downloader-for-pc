const $ = (selector) => document.querySelector(selector);

const urlInput = $("#url");
const fetchButton = $("#fetchBtn");
const statusBox = $("#status");
const resultBox = $("#result");

let selectedMode = "video";
let selectedQuality = "720p";
let currentVideo = null;

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = `status ${type}`.trim();
}

function setButtonLoading(button, loading, loadingText, normalText) {
  button.disabled = loading;
  button.textContent = loading ? loadingText : normalText;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    };

    return entities[character];
  });
}

function updateQualityLabel() {
  const qualityLabel = $("#qualityLabel");

  if (selectedMode === "audio") {
    qualityLabel.textContent = "192 kbps high quality";
    return;
  }

  qualityLabel.textContent =
    selectedQuality === "720p"
      ? "720p recommended"
      : selectedQuality;
}

function renderVideoResult(video) {
  const thumbnail = video.thumbnail
    ? `<img src="${escapeHtml(video.thumbnail)}" alt="Video thumbnail">`
    : `<div class="result-placeholder">AVD</div>`;

  resultBox.innerHTML = `
    ${thumbnail}
    <div>
      <h3>${escapeHtml(video.title)}</h3>
      <p>
        ${escapeHtml(video.creator)}
        · ${escapeHtml(video.duration)}
        · ${escapeHtml(video.views)} views
      </p>
      <p>${escapeHtml(video.platform)}</p>
      <button id="downloadBtn" type="button">
        Download ${selectedMode === "audio" ? "MP3" : "MP4"} ↗
      </button>
    </div>
  `;

  resultBox.hidden = false;

  const downloadButton = $("#downloadBtn");

  if (downloadButton) {
    downloadButton.addEventListener("click", downloadMedia);
  }
}

document.querySelectorAll(".mode").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".mode").forEach((item) => {
      item.classList.remove("active");
    });

    button.classList.add("active");
    selectedMode = button.dataset.mode;
    updateQualityLabel();

    if (currentVideo && !resultBox.hidden) {
      renderVideoResult(currentVideo);
    }
  });
});

document.querySelectorAll(".quality-grid button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".quality-grid button").forEach((item) => {
      item.classList.remove("selected");
    });

    button.classList.add("selected");
    selectedQuality = button.dataset.quality;
    updateQualityLabel();
  });
});

fetchButton.addEventListener("click", async () => {
  const url = urlInput.value.trim();

  if (!url) {
    setStatus("Paste a public video URL first.", "error");
    urlInput.focus();
    return;
  }

  setButtonLoading(
    fetchButton,
    true,
    "Reading...",
    "Fetch media ↗"
  );

  setStatus("Reading public media details...");
  resultBox.hidden = true;
  currentVideo = null;

  try {
    const response = await fetch("/api/info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error || "Could not read this link."
      );
    }

    currentVideo = data.video;
    renderVideoResult(currentVideo);

    setStatus(
      `${currentVideo.platform} media found.`,
      "success"
    );
  } catch (error) {
    resultBox.hidden = true;
    setStatus(
      error.message || "Something went wrong.",
      "error"
    );
  } finally {
    setButtonLoading(
      fetchButton,
      false,
      "Reading...",
      "Fetch media ↗"
    );
  }
});

async function downloadMedia() {
  if (!currentVideo) {
    setStatus("Fetch the media details before downloading.", "error");
    return;
  }

  const downloadButton = $("#downloadBtn");

  setButtonLoading(
    downloadButton,
    true,
    "Starting...",
    `Download ${selectedMode === "audio" ? "MP3" : "MP4"} ↗`
  );

  try {
    const response = await fetch("/api/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: currentVideo.url,
        mode: selectedMode,
        quality: selectedQuality
      })
    });

    const data = await response.json();

    if (!response.ok || !data.ok || !data.job_id) {
      throw new Error(
        data.error || "Could not start the download."
      );
    }

    const jobId = data.job_id;

    createDownloadPanel(downloadButton);

    setStatus("Download started.", "success");

    await monitorDownload(jobId);

  } catch (error) {
    console.error("Download error:", error);

    setStatus(
      error.message || "Download failed.",
      "error"
    );

    removeDownloadPanel();
  } finally {
    setButtonLoading(
      downloadButton,
      false,
      "Starting...",
      `Download ${selectedMode === "audio" ? "MP3" : "MP4"} ↗`
    );
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB"
  ];

  const index = Math.floor(
    Math.log(bytes) / Math.log(1024)
  );

  const safeIndex = Math.min(
    index,
    units.length - 1
  );

  const value =
    bytes / Math.pow(1024, safeIndex);

  if (safeIndex === 0) {
    return `${Math.round(value)} ${units[safeIndex]}`;
  }

  return `${value.toFixed(2)} ${units[safeIndex]}`;
}
function createDownloadPanel(downloadButton) {
  removeDownloadPanel();

  const panel = document.createElement("div");

  panel.id = "downloadProgressPanel";

  panel.innerHTML = `
    <div class="download-progress-header">
      <strong id="downloadProgressTitle">
        Downloading...
      </strong>

      <span id="downloadProgressPercent">
        0%
      </span>
    </div>

    <div class="download-progress-bar">
      <div
        id="downloadProgressFill"
        class="download-progress-fill"
        style="width: 0%"
      ></div>
    </div>

    <div class="download-progress-info">
      <span id="downloadProgressSize">
        0 B / 0 B
      </span>

      <span id="downloadProgressSpeed">
        0 B/s
      </span>
    </div>

    <div class="download-progress-actions">

      <button
        id="pauseDownloadBtn"
        type="button"
      >
        ⏸ Pause
      </button>

      <button
        id="resumeDownloadBtn"
        type="button"
        hidden
      >
        ▶ Resume
      </button>

      <button
        id="cancelDownloadBtn"
        type="button"
      >
        ✕ Cancel
      </button>

    </div>

    <div
      id="downloadProgressMessage"
      class="download-progress-message"
    >
      Preparing download...
    </div>
  `;

  downloadButton.replaceWith(panel);

  window.currentDownloadJobId = null;

  panel.querySelector("#pauseDownloadBtn")
    .addEventListener("click", async () => {
      const jobId = window.currentDownloadJobId;

      if (!jobId) return;

      try {
        const response = await fetch(
          `/api/download/${jobId}/pause`,
          {
            method: "POST"
          }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(
            data.error || "Could not pause download."
          );
        }

        showPausedControls();

      } catch (error) {
        setDownloadProgressMessage(
          error.message,
          true
        );
      }
    });

  panel.querySelector("#resumeDownloadBtn")
    .addEventListener("click", async () => {
      const jobId = window.currentDownloadJobId;

      if (!jobId) return;

      try {
        const response = await fetch(
          `/api/download/${jobId}/resume`,
          {
            method: "POST"
          }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(
            data.error || "Could not resume download."
          );
        }

        showRunningControls();

      } catch (error) {
        setDownloadProgressMessage(
          error.message,
          true
        );
      }
    });

  panel.querySelector("#cancelDownloadBtn")
    .addEventListener("click", async () => {
      const jobId = window.currentDownloadJobId;

      if (!jobId) return;

      try {
        const response = await fetch(
          `/api/download/${jobId}/cancel`,
          {
            method: "POST"
          }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(
            data.error || "Could not cancel download."
          );
        }

        setDownloadProgressMessage(
          "Download cancelled.",
          true
        );

        showPausedControls();

        const pauseButton =
          $("#pauseDownloadBtn");

        const resumeButton =
          $("#resumeDownloadBtn");

        const cancelButton =
          $("#cancelDownloadBtn");

        if (pauseButton) pauseButton.disabled = true;
        if (resumeButton) resumeButton.disabled = true;
        if (cancelButton) cancelButton.disabled = true;

      } catch (error) {
        setDownloadProgressMessage(
          error.message,
          true
        );
      }
    });
}


async function monitorDownload(jobId) {
  window.currentDownloadJobId = jobId;

  while (true) {
    await new Promise(resolve =>
      setTimeout(resolve, 1000)
    );

    const response = await fetch(
      `/api/download/${jobId}/status`
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error || "Could not read download status."
      );
    }

    const job = data.job;

    const percent =
      Number(job.percent || 0);

    const downloaded =
      formatBytes(
        job.downloaded_bytes || 0
      );

    const total =
      formatBytes(
        job.total_bytes || 0
      );

    const speed =
      formatBytes(
        job.speed || 0
      );

    updateDownloadProgress(
      percent,
      downloaded,
      total,
      speed
    );

    if (
      job.status === "starting" ||
      job.status === "preparing"
    ) {
      setDownloadProgressMessage(
        "Preparing download..."
      );

      showRunningControls();
    }

    if (job.status === "downloading") {
      setDownloadProgressMessage(
        "Downloading..."
      );

      showRunningControls();
    }

    if (job.status === "paused") {
      setDownloadProgressMessage(
        "Download paused."
      );

      showPausedControls();
    }

    if (job.status === "network_error") {

      setDownloadProgressMessage(
        "⚠ Network issue detected. Waiting for connection...",
        true
      );

      showPausedControls();

      /*
       * Try to resume automatically after 5 seconds.
       */
      await new Promise(resolve =>
        setTimeout(resolve, 5000)
      );

      try {
        const resumeResponse = await fetch(
          `/api/download/${jobId}/resume`,
          {
            method: "POST"
          }
        );

        const resumeData =
          await resumeResponse.json();

        if (
          resumeResponse.ok &&
          resumeData.ok
        ) {
          showRunningControls();

          setDownloadProgressMessage(
            "Connection restored. Resuming..."
          );
        }

      } catch (error) {
        console.log(
          "Automatic resume waiting:",
          error
        );
      }

      continue;
    }

    if (job.status === "processing") {
      setDownloadProgressMessage(
        "Processing video..."
      );

      showRunningControls();
    }

    if (job.status === "cancelled") {

      setDownloadProgressMessage(
        "Download cancelled.",
        true
      );

      disableDownloadControls();

      break;
    }

    if (job.status === "error") {
      throw new Error(
        job.error || "Download failed."
      );
    }

    if (job.status === "completed") {

      updateDownloadProgress(
        100,
        formatBytes(
          job.downloaded_bytes || 0
        ),
        formatBytes(
          job.total_bytes || 0
        ),
        "0 B/s"
      );

      setDownloadProgressMessage(
        "Download complete. Preparing file..."
      );

      const fileResponse = await fetch(
        `/api/download/${jobId}/file`
      );

      if (!fileResponse.ok) {
        let errorMessage =
          "Could not retrieve the downloaded file.";

        try {
          const errorData =
            await fileResponse.json();

          errorMessage =
            errorData.error ||
            errorMessage;

        } catch (_) {}

        throw new Error(errorMessage);
      }

      const fileBlob =
        await fileResponse.blob();

      if (!fileBlob.size) {
        throw new Error(
          "Downloaded file is empty."
        );
      }

      const temporaryUrl =
        URL.createObjectURL(fileBlob);

      const downloadLink =
        document.createElement("a");

      const safeFileName =
        (currentVideo.title || "video")
          .replace(/[^\w\s.-]/g, "")
          .trim()
          .slice(0, 90) || "video";

      const extension =
        selectedMode === "audio"
          ? "mp3"
          : "mp4";

      downloadLink.href =
        temporaryUrl;

      downloadLink.download =
        `${safeFileName}.${extension}`;

      document.body.appendChild(
        downloadLink
      );

      downloadLink.click();

      downloadLink.remove();

      setTimeout(() => {
        URL.revokeObjectURL(
          temporaryUrl
        );
      }, 5000);

      setDownloadProgressMessage(
        "✓ Download completed.",
        false
      );

      disableDownloadControls();

      break;
    }
  }

  window.currentDownloadJobId = null;
}


function updateDownloadProgress(
  percent,
  downloaded,
  total,
  speed
) {
  const percentElement =
    $("#downloadProgressPercent");

  const fillElement =
    $("#downloadProgressFill");

  const sizeElement =
    $("#downloadProgressSize");

  const speedElement =
    $("#downloadProgressSpeed");

  if (percentElement) {
    percentElement.textContent =
      `${percent.toFixed(1)}%`;
  }

  if (fillElement) {
    fillElement.style.width =
      `${Math.min(percent, 100)}%`;
  }

  if (sizeElement) {
    sizeElement.textContent =
      `${downloaded} / ${total}`;
  }

  if (speedElement) {
    speedElement.textContent =
      `${speed}/s`;
  }
}


function setDownloadProgressMessage(
  message,
  error = false
) {
  const element =
    $("#downloadProgressMessage");

  if (!element) return;

  element.textContent = message;

  element.classList.toggle(
    "error",
    error
  );
}


function showRunningControls() {
  const pauseButton =
    $("#pauseDownloadBtn");

  const resumeButton =
    $("#resumeDownloadBtn");

  if (pauseButton) {
    pauseButton.hidden = false;
    pauseButton.disabled = false;
  }

  if (resumeButton) {
    resumeButton.hidden = true;
    resumeButton.disabled = false;
  }
}


function showPausedControls() {
  const pauseButton =
    $("#pauseDownloadBtn");

  const resumeButton =
    $("#resumeDownloadBtn");

  if (pauseButton) {
    pauseButton.hidden = true;
  }

  if (resumeButton) {
    resumeButton.hidden = false;
    resumeButton.disabled = false;
  }
}


function disableDownloadControls() {
  const pauseButton =
    $("#pauseDownloadBtn");

  const resumeButton =
    $("#resumeDownloadBtn");

  const cancelButton =
    $("#cancelDownloadBtn");

  if (pauseButton) {
    pauseButton.disabled = true;
  }

  if (resumeButton) {
    resumeButton.disabled = true;
  }

  if (cancelButton) {
    cancelButton.disabled = true;
  }
}


function removeDownloadPanel() {
  const panel =
    $("#downloadProgressPanel");

  if (panel) {
    panel.remove();
  }

  window.currentDownloadJobId = null;
}

$("#commentForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const submitButton = form.querySelector("button");
  const commentStatus = $("#commentStatus");

  const name = $("#name").value.trim();
  const comment = $("#comment").value.trim();

  if (!name || !comment) {
    commentStatus.textContent = "Please complete both fields.";
    commentStatus.className = "status error";
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  commentStatus.textContent = "Saving your note...";
  commentStatus.className = "status";

  try {
    const response = await fetch("/api/comments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        comment
      })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error || "Could not save your feedback."
      );
    }

    commentStatus.textContent =
      data.message || "Thanks, your feedback is saved.";
    commentStatus.className = "status success";

    form.reset();
  } catch (error) {
    commentStatus.textContent =
      error.message || "Could not save your feedback.";
    commentStatus.className = "status error";
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = "Send feedback <span>↗</span>";
  }
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.12
  }
);

document.querySelectorAll(".reveal").forEach((element, index) => {
  element.style.transitionDelay =
    `${Math.min(index * 45, 260)}ms`;

  revealObserver.observe(element);
});

urlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    fetchButton.click();
  }
});