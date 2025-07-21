# ECharts MCP

This project shows how to implement an MCP (Model Context Protocol) server of Apache ECharts.

The basic workflow is that it gets chart type, data and other parameters from an LLM, and returns the cloud image URL of the generated ECharts chart.

Supported ECharts series types: `'bar', 'line', 'pie', 'scatter', 'funnel', 'tree', 'treemap', 'sunburst'`.

## Setup

```sh
npm install
```

Create an `.env` file. See `.env.example` for reference. You need to have the access to a [baidubce/bce-sdk-js](https://github.com/baidubce/bce-sdk-js) account to store the images on the cloud.

## Run

```sh
# Run the MCP server
npm run dev

# Run the inspector in another terminal
npm run inspect
```

## FAQ

### How to change image cloud storage?

By default, it uses [baidubce/bce-sdk-js](https://github.com/baidubce/bce-sdk-js) to store the generated image and return the URL of the image on the cloud. If you wish to use other Cloud storage, change the implemenation in `src/storage.js`.

### How to change ECharts theme?

See `registerTheme` and `registerFont` comments in `src/chart.js`.

### How to support more series types?

1. Change `inputSchema` in `src/index.js`
2. Normalize `data` in `src/chart.js`

You are welcomed to make a pull request.

## Discussion of Implementation

To make an MCP server of Apache ECharts, there are 3 common ways to do:

1. Ask LLM to provide a full ECharts option
2. Ask LLM to provide pre-fined parameters including chart themes
3. Ask LLM to provide pre-fined minimal parameters

The advantage of Approach 1 is that is has the potential of making all kinds of charts that ECharts supports. But it may not be stable, especially for less frequently used chart types.

Approach 2 gives the freedom to change chart themes from prompt. For example, you may ask the LLM to `generate a chart with red bars of data ...`. But this approach requires a lot of parameters in order to support so many ECharts options. And it degenerates to approach 1 as the number of parameters grows.

Approach 3 asks LLM to provide minimal parameters like series type, data, seriesName, title, and axisName. The chart theme is defined in the app so that only the developer of this app, rather than users can change the theme. We believe this is the best way to provide stable results and so this is the approach we take in this project.
