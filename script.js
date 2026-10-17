
const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
const imagePlaceholder = document.getElementById("imagePlaceholder");
const fileName = document.getElementById("fileName");
const clearImage = document.getElementById("clearImage");
const uploadCount = document.getElementById("uploadCount");
const historyMessage = document.getElementById("historyMessage");
const historyList = document.getElementById("historyList");
const previewStatus = document.getElementById("previewStatus");
const dashboardStatus = document.getElementById("dashboardStatus");
const clearHistory = document.getElementById("clearHistory");

let totalUploads = 0;
let currentImageUrl = null;

function releaseImageUrl() {
    if (currentImageUrl) {
        URL.revokeObjectURL(currentImageUrl);
        currentImageUrl = null;
    }
}

function resetPreview() {
    imagePreview.onload = null;
    imagePreview.onerror = null;
    imagePreview.removeAttribute("src");
    imagePreview.hidden = true;

    imagePlaceholder.hidden = false;
    fileName.textContent = "No image selected";
    clearImage.hidden = true;
    previewStatus.textContent = "Waiting for image";
    dashboardStatus.textContent = "Ready";

    releaseImageUrl();
}

imageInput.addEventListener("change", function () {
    const file = imageInput.files[0];

    if (!file) {
        return;
    }

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
        alert("Please select a JPG, PNG, or WEBP image.");
        imageInput.value = "";
        return;
    }

    releaseImageUrl();

    currentImageUrl = URL.createObjectURL(file);

    imagePreview.onload = function () {
        // Show image INSIDE the preview box.
        imagePlaceholder.hidden = true;
        imagePreview.hidden = false;

        previewStatus.textContent = "Image loaded";
        dashboardStatus.textContent = "Image ready";
    };

    imagePreview.onerror = function () {
        resetPreview();
        previewStatus.textContent = "Could not load image";
        alert("Could not load this image. Please select another.");
    };

    imagePreview.src = currentImageUrl;

    fileName.textContent = file.name;
    clearImage.hidden = false;
    previewStatus.textContent = "Loading image...";

    totalUploads++;
    uploadCount.textContent = totalUploads;

    historyMessage.textContent = "Images selected in this session:";

    const historyItem = document.createElement("li");
    historyItem.textContent = file.name;

    historyList.prepend(historyItem);
});

clearImage.addEventListener("click", function () {
    imageInput.value = "";
    resetPreview();
});

clearHistory.addEventListener("click", function () {
    historyList.replaceChildren();
    historyMessage.textContent = "No recent activity.";
});

window.addEventListener("beforeunload", releaseImageUrl);
