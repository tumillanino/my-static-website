(function () {
  var buttons = document.querySelectorAll("[data-email-codes]");

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      var codes = button.getAttribute("data-email-codes").split(",");
      var email = codes.map(function (code) {
        return String.fromCharCode(Number(code));
      }).join("");
      var label = button.querySelector("[data-email-label]");

      if (button.getAttribute("data-email-revealed") === "true") {
        window.location.href = "mailto:" + email;
        return;
      }

      button.setAttribute("data-email-revealed", "true");
      button.setAttribute("aria-label", "Email " + email + ". Click again to open your mail app.");

      if (label) {
        label.textContent = email;
      }
    });
  });
})();
