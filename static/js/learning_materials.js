const content_div = document.getElementById('learning-content');
const contents = document.getElementById('contents')
function matcontent(asl_class) {
    if (content_div) {
        content_div.style.display = 'flex';
    }
    contents.textContent += ' == ' + asl_class;
}

function closecontent() {
    if (content_div) {
        content_div.style.display = 'none';
    }
    contents.textContent = ' ';
}