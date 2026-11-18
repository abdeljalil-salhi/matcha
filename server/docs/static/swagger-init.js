const container = document.getElementById("swagger-ui");

SwaggerUIBundle({
  domNode: container,
  url: container.dataset.specUrl,
  deepLinking: true,
  validatorUrl: null,
  persistAuthorization: false,
});
