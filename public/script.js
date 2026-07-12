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
    var url = document.getElementById('tiktokUrl').value.trim();
    var container = document.getElementById('resultContainer');
    
    if (!url) {
        container.innerHTML = '<div class="text-red-400">Please paste a TikTok link</div>';
        return;
    }
    
    container.innerHTML = '<div class="text-gray-400">Processing...</div>';
    
    try {
        var response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        });
        
        var data = await response.json();
        
        if (data.success && data.data) {
            var result = data.data;
            var html = '<div class="bg-[252525] rounded-lg p-4 border border-gray-700">';
            
            if (result.username) {
                html += '<p class="text-accent font-bold mb-1">@' + result.username + '</p>';
            }
            if (result.description) {
                html += '<p class="text-white text-sm mb-3">' + result.description.substring(0, 100) + (result.description.length > 100 ? '...' : '') + '</p>';
            }
            
            html += '<div class="space-y-2">';
            
            if (result.type === 'photo') {
                if (result.slides && result.slides.length > 0) {
                    html += '<p class="text-gray-400 text-xs mb-2">Photo Slides (' + result.slides.length + ' images)</p>';
                    result.slides.forEach(function(slide) {
                        html += '<a href="' + slide.url + '" target="_blank" class="block bg-[191919] hover:bg-[2a2a2a] text-white px-4 py-2 rounded-lg transition border border-gray-700 text-sm">Download Image ' + slide.index + '</a>';
                    });
                }
            } else {
                if (result.downloads && result.downloads.nowm && result.downloads.nowm.length > 0) {
                    result.downloads.nowm.forEach(function(link) {
                        html += '<a href="' + link + '" target="_blank" class="block bg-[191919] hover:bg-[2a2a2a] text-white px-4 py-2 rounded-lg transition border border-gray-700 text-sm">Download Video (No Watermark)</a>';
                    });
                }
                if (result.downloads && result.downloads.wm && result.downloads.wm.length > 0) {
                    result.downloads.wm.forEach(function(link) {
                        html += '<a href="' + link + '" target="_blank" class="block bg-[191919] hover:bg-[2a2a2a] text-white px-4 py-2 rounded-lg transition border border-gray-700 text-sm">Download Video (With Watermark)</a>';
                    });
                }
                if (result.mp3 && result.mp3.length > 0) {
                    result.mp3.forEach(function(link) {
                        html += '<a href="' + link + '" target="_blank" class="block bg-[191919] hover:bg-[2a2a2a] text-white px-4 py-2 rounded-lg transition border border-gray-700 text-sm">Download Audio (MP3)</a>';
                    });
                }
            }
            
            if (result.thumbnail) {
                html += '<div class="mt-3"><img src="' + result.thumbnail + '" alt="Thumbnail" class="rounded-lg max-h-48 w-auto" /></div>';
            }
            
            html += '</div></div>';
            container.innerHTML = html;
        } else {
            container.innerHTML = '<div class="text-red-400">' + (data.error || 'Failed to get download links. Make sure the video is public.') + '</div>';
        }
    } catch (err) {
        container.innerHTML = '<div class="text-red-400">Error: ' + err.message + '</div>';
    }
});
