document.querySelectorAll('.faq-box .faq-question').forEach(function(question) {
    question.addEventListener('click', function() {
        var content = this.nextElementSibling;
        if (content.style.maxHeight && content.style.maxHeight !== '0px') {
            content.style.maxHeight = '0';
        } else {
            document.querySelectorAll('.faq-content').forEach(function(c) {
                c.style.maxHeight = '0';
            });
            content.style.maxHeight = content.scrollHeight + 'px';
        }
    });
});

var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
        if (entry.isIntersecting) {
            entry.target.classList.add('aos-animate');
        }
    });
}, { threshold: 0.1 });

document.querySelectorAll('[data-aos]').forEach(function(el) {
    observer.observe(el);
});

document.getElementById('downloadForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const url = document.getElementById('tiktokUrl').value.trim();
    if (!url) {
        alert('Please paste a TikTok link');
        return;
    }
    const container = document.getElementById('resultContainer');
    container.innerHTML = '<div class="text-gray-400">Processing...</div>';
    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await response.json();
        if (data.Status && data.Result && data.Result.length > 0) {
            let html = '<div class="bg-[252525] rounded-lg p-4 border border-gray-700">';
            if (data.Metadata && data.Metadata.title) {
                html += '<h3 class="text-white font-bold mb-2">' + data.Metadata.title + '</h3>';
            }
            if (data.Metadata && data.Metadata.author) {
                html += '<p class="text-gray-400 text-sm mb-3">by ' + data.Metadata.author + '</p>';
            }
            html += '<div class="space-y-2">';
            data.Result.forEach(function(item) {
                var label = item.label || item.type;
                html += '<a href="' + item.url + '" target="_blank" class="block bg-[191919] hover:bg-[2a2a2a] text-white px-4 py-2 rounded-lg transition border border-gray-700 text-sm">Download ' + label + '</a>';
            });
            html += '</div></div>';
            container.innerHTML = html;
        } else {
            container.innerHTML = '<div class="text-red-400">' + (data.Error || 'No download links found') + '</div>';
        }
    } catch (err) {
        container.innerHTML = '<div class="text-red-400">Error: ' + err.message + '</div>';
    }
});
