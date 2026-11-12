const API_BASE = "http://127.0.0.1:5000";

// Main detection workspace elements
const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
const imagePlaceholder = document.getElementById("imagePlaceholder");
const previewStatus = document.getElementById("previewStatus");
const fileName = document.getElementById("fileName");
const clearImage = document.getElementById("clearImage");
const detectButton = document.getElementById("detectButton");

// Dashboard and history elements
const uploadCount = document.getElementById("uploadCount");
const dashboardStatus = document.getElementById("dashboardStatus");
const historyMessage = document.getElementById("historyMessage");
const historyList = document.getElementById("historyList");
const detectionCount = document.getElementById("detectionCount");
const resultsPanel = document.getElementById("aiResults");
const clearHistoryButton = document.getElementById("clearHistory");

let selectedImage = null;
let previewURL = null;
let savedHistory = [];
let detectionInProgress = false;

// Format a saved date/time for display.
function formatDateTime(value) {
    if (!value) return "Date/time unavailable";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

// Wait until an image source can actually be decoded by the browser.
function verifyImageSource(source) {
    return new Promise((resolve, reject) => {
        const testImage = new Image();

        testImage.onload = () => resolve(source);
        testImage.onerror = () => reject(
            new Error("The detection image was returned, but the browser could not load it.")
        );

        testImage.src = source;
    });
}

// Convert the backend's annotated image field into a usable browser URL.
function getAnnotatedImageSource(data) {
    if (typeof data.annotated_image === "string" && data.annotated_image.trim()) {
        const value = data.annotated_image.trim();

        if (value.startsWith("data:image/")) {
            return value;
        }

        return `data:image/jpeg;base64,${value}`;
    }

    if (typeof data.result_url === "string" && data.result_url.trim()) {
        const value = data.result_url.trim();

        if (/^https?:\/\//i.test(value) || value.startsWith("data:image/")) {
            return value;
        }

        return `${API_BASE}${value.startsWith("/") ? "" : "/"}${value}`;
    }

    throw new Error("The backend response did not contain annotated_image or result_url.");
}

// Show an image in the main preview.
function displayImage(source) {
    imagePreview.onload = null;
    imagePreview.onerror = null;
    imagePreview.src = source;
    imagePreview.hidden = false;
    imagePlaceholder.hidden = true;
}

// Build and display the live detection report.
function showDetectionReport(data, detections) {
    const confidences = detections
        .map(item => Number(item.confidence_percent))
        .filter(value => Number.isFinite(value));

    const highest = confidences.length ? Math.max(...confidences) : 0;

    const average = confidences.length
        ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
        : 0;

    const total = Number.isFinite(Number(data.detections_count))
        ? Number(data.detections_count)
        : detections.length;

    const heading = document.createElement("h3");
    heading.textContent = "AI Detection Results";

    const count = document.createElement("p");
    count.textContent = `Total potholes detected: ${total}`;

    const summary = document.createElement("p");
    summary.textContent =
        `Highest confidence: ${highest.toFixed(2)}% | ` +
        `Average confidence: ${average.toFixed(2)}%`;

    const dimensions = document.createElement("p");

    if (data.image_width != null && data.image_height != null) {
        dimensions.textContent =
            `Image dimensions: ${data.image_width} × ${data.image_height} px`;
    } else {
        dimensions.textContent = "Image dimensions: unavailable";
    }

    resultsPanel.replaceChildren(
        heading,
        count,
        summary,
        dimensions
    );

    if (detections.length > 0) {
        const list = document.createElement("ul");

        detections.forEach((detection, index) => {
            const item = document.createElement("li");

            const confidence = Number(detection.confidence_percent);

            const confidenceText = Number.isFinite(confidence)
                ? `${confidence.toFixed(2)}%`
                : "Unavailable";

            item.textContent =
                `Pothole ${index + 1}: ${detection.class || "Pothole"} — ` +
                `${confidenceText} confidence` +
                (detection.box_width != null && detection.box_height != null
                    ? ` | Box: ${detection.box_width} × ${detection.box_height} px`
                    : "");

            list.appendChild(item);
        });

        resultsPanel.appendChild(list);

    } else {
        const note = document.createElement("p");
        note.textContent = "No potholes were detected in this image.";

        resultsPanel.appendChild(note);
    }

    resultsPanel.hidden = false;
}

// Display a report saved in history.
function showSavedReport(record) {
    const detections = Array.isArray(record.detections)
        ? record.detections
        : [];

    const confidences = detections
        .map(item => Number(item.confidence_percent))
        .filter(value => Number.isFinite(value));

    const highest = confidences.length ? Math.max(...confidences) : 0;

    const average = confidences.length
        ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
        : 0;

    const heading = document.createElement("h3");
    heading.textContent = "Saved Detection Report";

    const summary = document.createElement("p");

    summary.textContent =
        `Total potholes: ${record.detections_count || 0} | ` +
        `Highest confidence: ${highest.toFixed(2)}% | ` +
        `Average confidence: ${average.toFixed(2)}%`;

    const dimensions = document.createElement("p");

    dimensions.textContent =
        `Image dimensions: ${record.image_width || "—"} × ` +
        `${record.image_height || "—"} px`;

    const date = document.createElement("p");
    date.textContent = `Uploaded: ${formatDateTime(record.created_at)}`;

    const list = document.createElement("ul");

    detections.forEach((detection, index) => {
        const item = document.createElement("li");

        const box = Array.isArray(detection.box)
            ? detection.box
            : [];

        item.textContent =
            `Pothole ${index + 1}: ` +
            `${Number(detection.confidence_percent || 0).toFixed(2)}% confidence` +
            (detection.box_width != null && detection.box_height != null
                ? ` | Box: ${detection.box_width} × ${detection.box_height} px`
                : "") +
            (box.length === 4
                ? ` | Coordinates: ${box.join(", ")}`
                : "");

        list.appendChild(item);
    });

    resultsPanel.replaceChildren(
        heading,
        summary,
        dimensions,
        date
    );

    if (detections.length > 0) {
        resultsPanel.appendChild(list);
    } else {
        const note = document.createElement("p");
        note.textContent = "No potholes were detected in this image.";

        resultsPanel.appendChild(note);
    }

    resultsPanel.hidden = false;
}

// Select and preview an image.
imageInput.addEventListener("change", function () {
    const file = this.files && this.files[0];

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        alert("Please select a JPG, PNG, or WEBP image.");
        this.value = "";
        return;
    }

    selectedImage = file;

    if (previewURL) {
        URL.revokeObjectURL(previewURL);
        previewURL = null;
    }

    const currentPreviewURL = URL.createObjectURL(file);
    previewURL = currentPreviewURL;

    imagePreview.onload = function () {
        if (previewURL !== currentPreviewURL) return;

        imagePreview.hidden = false;
        imagePlaceholder.hidden = true;
        previewStatus.textContent = "Image loaded";
    };

    imagePreview.onerror = function () {
        if (previewURL !== currentPreviewURL) return;

        selectedImage = null;
        imagePreview.hidden = true;
        imagePlaceholder.hidden = false;
        imagePlaceholder.textContent = "Unable to preview this image.";

        previewStatus.textContent = "Preview failed";
        detectButton.disabled = true;
    };

    imagePreview.src = currentPreviewURL;

    fileName.textContent = file.name;

    clearImage.hidden = false;
    detectButton.disabled = false;
    detectButton.textContent = "Detect Potholes";

    resultsPanel.replaceChildren();
    resultsPanel.hidden = true;

    dashboardStatus.textContent = "Image Ready";
});

// Render saved history without changing the current detection preview.
function renderHistory(history) {
    savedHistory = Array.isArray(history) ? history : [];

    historyList.replaceChildren();

    uploadCount.textContent = savedHistory.length;

    const totalDetections = savedHistory.reduce(
        (sum, item) => sum + Number(item.detections_count || 0),
        0
    );

    detectionCount.textContent = totalDetections;

    if (savedHistory.length === 0) {
        historyMessage.textContent = "No saved detections yet.";
        return;
    }

    historyMessage.textContent =
        `${savedHistory.length} saved image(s) · ${totalDetections} pothole(s) detected`;

    savedHistory.forEach(record => {
        const item = document.createElement("li");

        item.className = "history-item";
        item.style.display = "flex";
        item.style.alignItems = "center";
        item.style.gap = "12px";
        item.style.padding = "12px 0";
        item.style.borderBottom = "1px solid #e5e7eb";

        const thumbnail = document.createElement("img");

        thumbnail.src = record.result_url || record.original_url || "";
        thumbnail.alt = "Detection result";
        thumbnail.style.width = "90px";
        thumbnail.style.height = "64px";
        thumbnail.style.objectFit = "cover";
        thumbnail.style.borderRadius = "8px";
        thumbnail.style.flexShrink = "0";

        const details = document.createElement("div");

        details.style.flex = "1";
        details.style.minWidth = "0";

        const name = document.createElement("strong");
        name.textContent = record.filename || "Road image";

        const date = document.createElement("p");

        date.textContent = formatDateTime(record.created_at);
        date.style.margin = "5px 0";

        const count = document.createElement("p");

        count.textContent =
            `${record.detections_count || 0} pothole(s) detected`;

        count.style.margin = "0";

        const viewButton = document.createElement("button");

        viewButton.type = "button";
        viewButton.className = "btn secondary small";
        viewButton.textContent = "View";
        viewButton.style.marginTop = "6px";

        viewButton.addEventListener("click", async function () {
            const savedImageURL =
                record.result_url || record.original_url;

            if (!savedImageURL) {
                alert("No saved image URL is available for this history item.");
                return;
            }

            viewButton.disabled = true;

            try {
                await verifyImageSource(savedImageURL);

                displayImage(savedImageURL);

                selectedImage = null;
                imageInput.value = "";

                detectButton.disabled = true;
                detectButton.textContent = "Detect Potholes";

                clearImage.hidden = true;

                fileName.textContent =
                    record.filename || "Saved image";

                previewStatus.textContent = "Saved detection";
                dashboardStatus.textContent = "History Viewed";

                showSavedReport(record);

                document.getElementById("detection").scrollIntoView({
                    behavior: "smooth"
                });

            } catch (error) {
                console.error("History image load error:", error);

                alert(
                    "Could not load this saved image. Check that the Flask server is running."
                );

            } finally {
                viewButton.disabled = false;
            }
        });

        const deleteButton = document.createElement("button");

        deleteButton.type = "button";
        deleteButton.textContent = "×";
        deleteButton.title = "Delete this history item";

        deleteButton.setAttribute(
            "aria-label",
            `Delete ${record.filename || "history item"}`
        );

        deleteButton.style.border = "none";
        deleteButton.style.background = "transparent";
        deleteButton.style.color = "#dc2626";
        deleteButton.style.fontSize = "24px";
        deleteButton.style.cursor = "pointer";
        deleteButton.style.padding = "4px 10px";

        deleteButton.addEventListener("click", async function () {
            const confirmed = confirm(
                `Delete "${record.filename || "this image"}" from history?`
            );

            if (!confirmed) return;

            deleteButton.disabled = true;

            try {
                const response = await fetch(
                    `${API_BASE}/history/${encodeURIComponent(record.image_id)}`,
                    { method: "DELETE" }
                );

                const data = await response.json();

                if (!response.ok || data.status !== "success") {
                    throw new Error(
                        data.error || "Could not delete history."
                    );
                }

                await loadHistory();

            } catch (error) {
                console.error("Delete history error:", error);

                alert(
                    "Could not delete this history item. Check the Flask backend."
                );

                deleteButton.disabled = false;
            }
        });

        details.append(name, date, count, viewButton);

        item.append(
            thumbnail,
            details,
            deleteButton
        );

        historyList.appendChild(item);
    });
}

// Fetch persistent history from Flask/SQLite.
async function loadHistory() {
    try {
        const response = await fetch(`${API_BASE}/history`);

        const data = await response.json();

        if (!response.ok || data.status !== "success") {
            throw new Error(
                data.error || "Could not load history."
            );
        }

        renderHistory(data.history);

        return true;

    } catch (error) {
        console.error("Load history error:", error);

        historyMessage.textContent =
            "Unable to load saved history. Make sure Flask is running.";

        return false;
    }
}

// Send the selected image to Flask and keep the immediate result in the detection workspace.
async function detectPotholes() {
    if (detectionInProgress) return;

    if (!selectedImage) {
        alert("Please select a road image first.");
        return;
    }

    const imageBeingAnalyzed = selectedImage;

    detectionInProgress = true;

    detectButton.disabled = true;
    detectButton.textContent = "Analyzing...";

    previewStatus.textContent = "Detecting potholes...";
    dashboardStatus.textContent = "Analyzing";

    resultsPanel.replaceChildren();
    resultsPanel.hidden = false;

    const loadingMessage = document.createElement("p");

    loadingMessage.textContent =
        "AI is analyzing your road image...";

    resultsPanel.appendChild(loadingMessage);

    try {
        const formData = new FormData();

        formData.append("image", imageBeingAnalyzed);

        const response = await fetch(`${API_BASE}/upload`, {
            method: "POST",
            body: formData
        });

        let data;

        try {
            data = await response.json();

        } catch {
            throw new Error(
                `The server returned an unreadable response (HTTP ${response.status}).`
            );
        }

        if (!response.ok || !data || data.status !== "success") {
            throw new Error(
                (data && data.error) ||
                `AI detection failed (HTTP ${response.status}).`
            );
        }

        if (selectedImage !== imageBeingAnalyzed) return;

        const annotatedSource =
            getAnnotatedImageSource(data);

        await verifyImageSource(annotatedSource);

        if (selectedImage !== imageBeingAnalyzed) return;

        displayImage(annotatedSource);

        const detections = Array.isArray(data.detections)
            ? data.detections
            : [];

        previewStatus.textContent = "Detection complete";
        dashboardStatus.textContent = "Completed";

        showDetectionReport(data, detections);

        // Refresh history without replacing the live result.
        await loadHistory();

    } catch (error) {
        console.error("RoadVision detection error:", error);

        if (selectedImage === imageBeingAnalyzed) {
            previewStatus.textContent = "Detection failed";
            dashboardStatus.textContent = "Error";

            const errorHeading = document.createElement("h3");

            errorHeading.textContent = "Detection Failed";

            const errorMessage = document.createElement("p");

            errorMessage.textContent =
                `${error.message} Make sure Flask is running at ${API_BASE}.`;

            resultsPanel.replaceChildren(
                errorHeading,
                errorMessage
            );

            resultsPanel.hidden = false;
        }

    } finally {
        detectionInProgress = false;

        detectButton.disabled = !selectedImage;
        detectButton.textContent = "Detect Potholes";
    }
}

detectButton.addEventListener("click", detectPotholes);

// Clear the selected image from the preview only.
clearImage.addEventListener("click", function () {
    imageInput.value = "";
    selectedImage = null;

    if (previewURL) {
        URL.revokeObjectURL(previewURL);
        previewURL = null;
    }

    imagePreview.onload = null;
    imagePreview.onerror = null;

    imagePreview.removeAttribute("src");
    imagePreview.hidden = true;

    imagePlaceholder.hidden = false;

    imagePlaceholder.textContent =
        "Your selected image will appear here";

    fileName.textContent = "No image selected";

    previewStatus.textContent = "Waiting for image";

    clearImage.hidden = true;

    detectButton.disabled = true;
    detectButton.textContent = "Detect Potholes";

    resultsPanel.replaceChildren();
    resultsPanel.hidden = true;

    dashboardStatus.textContent = "Ready";

    const totalDetections = savedHistory.reduce(
        (sum, item) => sum + Number(item.detections_count || 0),
        0
    );

    detectionCount.textContent = totalDetections;
});

// Clear all saved history from the database.
clearHistoryButton.addEventListener("click", async function () {
    if (savedHistory.length === 0) return;

    const confirmed = confirm(
        "Clear all saved detection history? This will delete saved images and reports too."
    );

    if (!confirmed) return;

    clearHistoryButton.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/history`, {
            method: "DELETE"
        });

        const data = await response.json();

        if (!response.ok || data.status !== "success") {
            throw new Error(
                data.error || "Could not clear history."
            );
        }

        await loadHistory();

    } catch (error) {
        console.error("Clear history error:", error);

        alert(
            "Could not clear history. Check the Flask backend."
        );

    } finally {
        clearHistoryButton.disabled = false;
    }
});

// Load saved records whenever the page opens or refreshes.
loadHistory();
