function generateErrorResponse (response, err) {
    const out = {
      error: {
        code: err
      }
    };
    console.log(err)
    response.send(out)
}

module.exports = { generateErrorResponse }
