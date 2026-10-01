const $ = (selector) => document.querySelector(selector);

const urlInput = $("#url");
const fetchButton = $("#fetchBtn");
const statusBox = $("#status");
const resultBox = $("#result");

let selectedMode = "video";
let selectedQuality = "720p";
let currentVideo = null;
let currentDownloadJobId = null;
let selectedDirectoryHandle = null;

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = ("status " + type).trim();
}

function setButtonLoading(button, loading, loadingText, normalText) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? loadingText : normalText;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[character]));
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return index === 0 ? Math.round(value) + " " + units[index] : value.toFixed(2) + " " + units[index];
}

function updateQualityLabel() {
  const label = $("#qualityLabel");
  if (!label) return;
  if (selectedMode === "audio") {
    label.textContent = "192 kbps high quality";
  } else if (selectedMode === "image") {
    label.textContent = "Original image quality";
  } else {
    label.textContent = selectedQuality === "720p" ? "720p recommended" : selectedQuality;
  }
}

function updateQualityButtons() {
  const available = new Set((currentVideo && currentVideo.available_qualities) || []);
  document.querySelectorAll(".quality-grid button").forEach((button) => {
    const quality = button.dataset.quality;
    const maxAvailable = Math.max(...Array.from(available).map((q) => Number.parseInt(q, 10) || 0), 0);
    const requested = Number.parseInt(quality, 10) || 0;
    const enabled = selectedMode === "image" || !currentVideo || available.size === 0 || available.has(quality) || (requested > 0 && requested < maxAvailable);
    button.disabled = !enabled;
    button.title = enabled ? "Available from source" : quality + " is not available from this source";
    button.classList.toggle("unavailable", !enabled);
  });
}

function renderVideoResult(video) {
  const thumbnail = video.thumbnail
    ? '<img src="' + escapeHtml(video.thumbnail) + '" alt="Media thumbnail">'
    : '<div class="result-placeholder">AVD</div>';

  const available = (video.available_qualities || []).join(", ");
  const details = selectedMode === "image"
    ? '<p>Original image quality</p>'
    : selectedMode === "audio"
      ? '<p>Audio extraction · MP3</p>'
      : '<p>Available: ' + escapeHtml(available || "Source formats will be checked at download time") + '</p>';

  resultBox.innerHTML =
    thumbnail +
    '<div><h3>' + escapeHtml(video.title) + '</h3>' +
    '<p>' + escapeHtml(video.creator) + ' · ' + escapeHtml(video.duration) + ' · ' + escapeHtml(video.views) + ' views</p>' +
    '<p>' + escapeHtml(video.platform) + '</p>' +
    details +
    '<button id="downloadBtn" type="button">Download ' +
    (selectedMode === "audio" ? "MP3" : selectedMode === "image" ? "Image" : "MP4") +
    ' ↗</button></div>';

  resultBox.hidden = false;
  $("#downloadBtn")?.addEventListener("click", downloadMedia);
  updateQualityButtons();
}

document.querySelectorAll(".mode").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".mode").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    selectedMode = button.dataset.mode;
    updateQualityLabel();
    if (currentVideo && !resultBox.hidden) renderVideoResult(currentVideo);
  });
});

document.querySelectorAll(".quality-grid button").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.disabled) {
      setStatus(button.dataset.quality + " is not available for this source. Please select another quality.", "error");
      return;
    }
    document.querySelectorAll(".quality-grid button").forEach((item) => item.classList.remove("selected"));
    button.classList.add("selected");
    selectedQuality = button.dataset.quality;
    updateQualityLabel();
  });
});

fetchButton.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  if (!url) {
    setStatus("Paste a public media URL first.", "error");
    urlInput.focus();
    return;
  }

  setButtonLoading(fetchButton, true, "Reading...", "Fetch media ↗");
  setStatus("Reading public media details...");
  resultBox.hidden = true;
  currentVideo = null;

  try {
    const response = await fetch("/api/info", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({url})
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not read this link.");
    currentVideo = data.video;
    renderVideoResult(currentVideo);
    setStatus(currentVideo.platform + " media found.", "success");
  } catch (error) {
    setStatus(error.message || "Something went wrong.", "error");
  } finally {
    setButtonLoading(fetchButton, false, "Reading...", "Fetch media ↗");
  }
});

async function chooseDownloadLocation() {
  if (!window.showDirectoryPicker) {
    setStatus("Folder browsing is not supported here. The normal Downloads location will be used.", "error");
    return;
  }
  try {
    selectedDirectoryHandle = await window.showDirectoryPicker({mode: "readwrite"});
    $("#locationLabel").textContent = selectedDirectoryHandle.name || "Selected folder";
  } catch (_) {}
}

$("#browseLocationBtn")?.addEventListener("click", chooseDownloadLocation);

async function saveBlobToSelectedFolder(blob, filename) {
  if (!selectedDirectoryHandle) return false;
  try {
    const permission = await selectedDirectoryHandle.requestPermission({mode: "readwrite"});
    if (permission !== "granted") return false;
    const handle = await selectedDirectoryHandle.getFileHandle(filename, {create: true});
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (error) {
    console.warn("Folder save failed:", error);
    return false;
  }
}

async function downloadMedia() {
  if (!currentVideo) {
    setStatus("Fetch the media details before downloading.", "error");
    return;
  }

  if (selectedMode === "video" &&
      currentVideo.available_qualities &&
      currentVideo.available_qualities.length &&
      !currentVideo.available_qualities.includes(selectedQuality) && Number.parseInt(selectedQuality, 10) >= Math.max(...currentVideo.available_qualities.map((q) => Number.parseInt(q, 10) || 0))) {
    setStatus(selectedQuality + " is not available for this source. Please select another quality.", "error");
    return;
  }

  const downloadButton = $("#downloadBtn");
  setButtonLoading(downloadButton, true, "Starting...", "Download ↗");

  try {
    const response = await fetch("/api/download", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        url: currentVideo.url,
        mode: selectedMode,
        quality: selectedMode === "image" ? "Original" : selectedQuality
      })
    });
    const data = await response.json();
    if (!response.ok || !data.ok || !data.job_id) {
      throw new Error(data.error || "Could not start the download.");
    }

    createDownloadPanel();
    currentDownloadJobId = data.job_id;
    setStatus("Download started.", "success");
    await monitorDownload(data.job_id);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Download failed.", "error");
    setDownloadProgressMessage(error.message || "Download failed.", true);
  } finally {
    setButtonLoading(downloadButton, false, "Starting...", "Download ↗");
  }
}

function createDownloadPanel() {
  const old = $("#downloadProgressPanel");
  if (old) old.remove();

  const panel = document.createElement("div");
  panel.id = "downloadProgressPanel";
  panel.innerHTML =
    '<div class="download-progress-header"><strong id="downloadProgressTitle">Downloading...</strong><span id="downloadProgressPercent">0%</span></div>' +
    '<div class="download-progress-bar"><div id="downloadProgressFill" class="download-progress-fill" style="width:0%"></div></div>' +
    '<div class="download-progress-info"><span id="downloadProgressSize">0 B / 0 B</span><span id="downloadProgressSpeed">0 B/s</span><span id="downloadProgressEta">ETA —</span></div>' +
    '<div class="download-progress-actions"><button id="pauseDownloadBtn" type="button">⏸ Pause</button><button id="resumeDownloadBtn" type="button" hidden>▶ Resume</button><button id="cancelDownloadBtn" type="button">✕ Cancel</button></div>' +
    '<div id="downloadProgressMessage" class="download-progress-message">Preparing download...</div>';

  const result = $("#result");
  result?.after(panel);

  $("#pauseDownloadBtn")?.addEventListener("click", () => controlDownload("pause"));
  $("#resumeDownloadBtn")?.addEventListener("click", () => controlDownload("resume"));
  $("#cancelDownloadBtn")?.addEventListener("click", () => controlDownload("cancel"));
}

async function controlDownload(action) {
  if (!currentDownloadJobId) return;
  try {
    const response = await fetch("/api/download/" + currentDownloadJobId + "/" + action, {method: "POST"});
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not " + action + " download.");
    if (action === "pause") showPausedControls();
    if (action === "resume") showRunningControls();
    if (action === "cancel") {
      disableDownloadControls();
      setDownloadProgressMessage("Download cancelled.", true);
    }
  } catch (error) {
    setDownloadProgressMessage(error.message, true);
  }
}

async function monitorDownload(jobId) {
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    const response = await fetch("/api/download/" + jobId + "/status");
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not read download status.");

    const job = data.job;
    updateDownloadProgress(
      Number(job.percent || 0),
      formatBytes(job.downloaded_bytes || 0),
      formatBytes(job.total_bytes || 0),
      formatBytes(job.speed || 0),
      job.eta
    );

    if (job.status === "starting" || job.status === "preparing") {
      setDownloadProgressMessage("Preparing download...");
      showRunningControls();
    } else if (job.status === "downloading") {
      setDownloadProgressMessage("Downloading...");
      showRunningControls();
    } else if (job.status === "processing") {
      setDownloadProgressMessage("Processing final file...");
      showRunningControls();
    } else if (job.status === "paused") {
      setDownloadProgressMessage("Download paused.");
      showPausedControls();
    } else if (job.status === "network_error") {
      setDownloadProgressMessage("Network issue detected. You can resume the download.", true);
      showPausedControls();
    } else if (job.status === "cancelled") {
      disableDownloadControls();
      break;
    } else if (job.status === "error") {
      throw new Error(job.error || "Download failed.");
    }

    if (job.status === "completed") {
      await finishFileDownload(jobId, job);
      break;
    }
  }
  currentDownloadJobId = null;
}

async function finishFileDownload(jobId, job) {
  updateDownloadProgress(100, formatBytes(job.downloaded_bytes || 0), formatBytes(job.total_bytes || 0), "0 B/s", 0);
  const fileResponse = await fetch("/api/download/" + jobId + "/file");
  if (!fileResponse.ok) {
    let message = "Could not retrieve the downloaded file.";
    try { message = (await fileResponse.json()).error || message; } catch (_) {}
    throw new Error(message);
  }

  const blob = await fileResponse.blob();
  if (!blob.size) throw new Error("Downloaded file is empty.");

  const safeName = (currentVideo?.title || "download")
    .replace(/[^\w\s.-]/g, "").trim().slice(0, 90) || "download";
  const extension = selectedMode === "audio" ? "mp3" : selectedMode === "image" ? (job.filename || "image.jpg").split(".").pop() : "mp4";
  const filename = safeName + "." + extension;

  if (window.VidLoomNative && typeof window.VidLoomNative.download === "function") {
    window.VidLoomNative.download(
      new URL("/api/download/" + jobId + "/file", window.location.origin).href,
      filename
    );
  } else if (!(await saveBlobToSelectedFolder(blob, filename))) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
  }

  setDownloadProgressMessage("✓ Download completed.", false);
  disableDownloadControls();
  addRecentDownload({
    title: currentVideo?.title || filename,
    platform: currentVideo?.platform || "Source",
    quality: selectedMode === "image" ? "Original" : selectedQuality,
    file_type: selectedMode.toUpperCase()
  });
}

function updateDownloadProgress(percent, downloaded, total, speed, eta) {
  $("#downloadProgressPercent") && ($("#downloadProgressPercent").textContent = percent.toFixed(1) + "%");
  $("#downloadProgressFill") && ($("#downloadProgressFill").style.width = Math.min(percent, 100) + "%");
  $("#downloadProgressSize") && ($("#downloadProgressSize").textContent = downloaded + " / " + total);
  $("#downloadProgressSpeed") && ($("#downloadProgressSpeed").textContent = speed + "/s");
  $("#downloadProgressEta") && ($("#downloadProgressEta").textContent = eta ? "ETA " + eta + "s" : "ETA —");
}

function setDownloadProgressMessage(message, error = false) {
  const element = $("#downloadProgressMessage");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", error);
}

function showRunningControls() {
  const pause = $("#pauseDownloadBtn");
  const resume = $("#resumeDownloadBtn");
  if (pause) { pause.hidden = false; pause.disabled = false; }
  if (resume) { resume.hidden = true; resume.disabled = false; }
}

function showPausedControls() {
  const pause = $("#pauseDownloadBtn");
  const resume = $("#resumeDownloadBtn");
  if (pause) pause.hidden = true;
  if (resume) { resume.hidden = false; resume.disabled = false; }
}

function disableDownloadControls() {
  ["pauseDownloadBtn", "resumeDownloadBtn", "cancelDownloadBtn"].forEach((id) => {
    const button = $("#" + id);
    if (button) button.disabled = true;
  });
}

async function loadRecentDownloads() {
  const list = $("#recentList");
  if (!list) return;
  try {
    const response = await fetch("/api/recent");
    const data = await response.json();
    if (!data.ok || !data.items.length) {
      list.innerHTML = '<p class="recent-empty">No completed downloads yet.</p>';
      return;
    }
    list.innerHTML = data.items.map((item) =>
      '<article class="recent-item"><div><strong>' + escapeHtml(item.title || "Downloaded file") +
      '</strong><small>' + escapeHtml(item.platform || "") + ' · ' +
      escapeHtml(item.quality || "") + ' · ' + escapeHtml(item.file_type || "FILE") +
      '</small></div><div class="recent-actions"><button class="recent-open" type="button" title="Open Downloads folder">▣</button>' +
      '<button class="recent-remove" type="button" title="Remove">×</button></div></article>'
    ).join("");
  } catch (_) {
    list.innerHTML = '<p class="recent-empty">Recent downloads will appear here.</p>';
  }
}

function addRecentDownload(item) {
  loadRecentDownloads();
}

$("#clearRecentBtn")?.addEventListener("click", () => {
  const list = $("#recentList");
  if (list) list.innerHTML = '<p class="recent-empty">Recent list cleared from this view.</p>';
});

document.addEventListener("click", (event) => {
  const remove = event.target.closest(".recent-remove");
  if (remove) {
    remove.closest(".recent-item")?.remove();
    return;
  }
  const open = event.target.closest(".recent-open");
  if (open && window.VidLoomNative && typeof window.VidLoomNative.openDownloads === "function") {
    window.VidLoomNative.openDownloads();
  }
});

$("#commentForm")?.addEventListener("submit", async (event) => {
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
  try {
    const response = await fetch("/api/comments", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({name, comment})
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not save your feedback.");
    commentStatus.textContent = data.message || "Thanks, your feedback is saved.";
    commentStatus.className = "status success";
    form.reset();
  } catch (error) {
    commentStatus.textContent = error.message || "Could not save your feedback.";
    commentStatus.className = "status error";
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = "Send feedback <span>↗</span>";
  }
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      revealObserver.unobserve(entry.target);
    }
  });
}, {threshold: 0.12});

document.querySelectorAll(".reveal").forEach((element, index) => {
  element.style.transitionDelay = Math.min(index * 45, 260) + "ms";
  revealObserver.observe(element);
});

urlInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    fetchButton.click();
  }
});

loadRecentDownloads();
