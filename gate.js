/* Simple front-end pass-code gate for SUNJIN Vietnam.
 * Included on every page EXCEPT careers.html / careers-detail.html (free access).
 * Unlocks with the pass code below; the granted state is remembered in localStorage.
 * Note: client-side only — deters casual access, not a real security boundary.
 */
(function () {
    var KEY  = 'sj_access';
    var PASS = '668888';

    try { if (localStorage.getItem(KEY) === '1') return; } catch (e) {}

    var style = document.createElement('style');
    style.textContent =
        '#sj-gate{position:fixed;inset:0;z-index:2147483647;background:#0a0a0a;display:flex;align-items:center;justify-content:center;font-family:"Open Sans",sans-serif;padding:24px;}'
      + '#sj-gate *{box-sizing:border-box;}'
      + '#sj-gate .sj-box{width:100%;max-width:360px;text-align:center;}'
      + '#sj-gate .sj-logo{height:60px;width:auto;margin:0 auto 30px;display:block;}'
      + '#sj-gate .sj-kick{font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:rgba(255,255,255,.4);margin:0 0 12px;}'
      + '#sj-gate h2{font-weight:300;font-size:1.6rem;color:#fff;margin:0 0 26px;}'
      + '#sj-gate input{width:100%;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.25);color:#fff;font-size:22px;letter-spacing:.45em;text-align:center;padding:12px 0 12px .45em;outline:none;transition:border-color .25s ease;}'
      + '#sj-gate input:focus{border-bottom-color:#fff;}'
      + '#sj-gate button{margin-top:28px;width:100%;background:#fff;color:#0a0a0a;border:none;border-radius:6px;padding:14px;font-size:11px;letter-spacing:.25em;text-transform:uppercase;cursor:pointer;transition:opacity .2s ease;}'
      + '#sj-gate button:hover{opacity:.85;}'
      + '#sj-gate .sj-err{color:#e08a8a;font-size:12px;margin-top:16px;min-height:15px;opacity:0;transition:opacity .2s ease;}'
      + '#sj-gate .sj-err.show{opacity:1;}';
    (document.head || document.documentElement).appendChild(style);

    var gate = document.createElement('div');
    gate.id = 'sj-gate';
    gate.innerHTML =
        '<div class="sj-box">'
      + '<img class="sj-logo" src="https://sunjin-vietnam.vercel.app/images/slogo2.png" alt="Sunjin Vietnam">'
      + '<p class="sj-kick">Khu vực hạn chế · Restricted</p>'
      + '<h2>Nhập mã truy cập</h2>'
      + '<input id="sj-pass" type="password" inputmode="numeric" autocomplete="off" maxlength="16" aria-label="Pass code">'
      + '<button id="sj-go" type="button">Truy cập / Enter</button>'
      + '<p class="sj-err" id="sj-err">Mã không đúng. Vui lòng thử lại. · Incorrect code.</p>'
      + '</div>';
    (document.body || document.documentElement).appendChild(gate);
    document.documentElement.style.overflow = 'hidden';

    function unlock() {
        var inp = document.getElementById('sj-pass');
        if ((inp.value || '').trim() === PASS) {
            try { localStorage.setItem(KEY, '1'); } catch (e) {}
            gate.parentNode && gate.parentNode.removeChild(gate);
            document.documentElement.style.overflow = '';
        } else {
            document.getElementById('sj-err').classList.add('show');
            inp.value = ''; inp.focus();
        }
    }
    gate.querySelector('#sj-go').addEventListener('click', unlock);
    gate.querySelector('#sj-pass').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); unlock(); }
    });
    setTimeout(function () { var i = document.getElementById('sj-pass'); if (i) i.focus(); }, 60);
})();
