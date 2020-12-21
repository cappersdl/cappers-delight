# Capper's Delight

Capper's Delight is an Electron UI for youtube-dl. The intent is to make it easier to do basic tasks like browsing a site, previewing a video, and then adding it to a queue for downloading. 

## What it does

* The app supports adding bookmarks to your favorite sites which will remain unspoken
* Allows you to click a video link to preview it before capturing
* Allows you to select a directory where downloads are saved
* Allows you to add the video to a queue
  - Downloads are added to a scrollable list
  - Downloads can be cancelled
  - While being downloaded, videos can be opened in the OS default viewer
  - Completed or cancelled download files can be deleted
* Supports any source supported by youtube-dl

## What it doesn't do

* Expose all of the configuration options available for youtube-dl. It's meant to be a simple, but effective UI
* Protect you from your legal obligations to only download what you're allowed to
* Make you a sandwich


## Usage

1. Capper's Delight act's like a web browser, so you can navigate to a site, click a video, and download it.
2. In the left-hand pane is a queue of currently downloading/completed/cancelled files.
3. In the lower-left is a Screener window. If the page you're browsing opens a link in a new page, it opens here. Optionally in the browser, you can right-click and select "Open in Screener" to force this action.
4. Any link clicked or opened in the screener will be added to the Video URL field. Clicking the download button adds this video to the download queue.
5. Optionally, if you have a direct video link, you can enter it into this field for ad-hoc downlods.

## Requirements

* *youtube-dl* : you'll need to have this installed on your system. If you don't know how to install it and run it from a CLI, this is a non-starter. You won't find instructions here. Perhaps a Google search may be in order?
* *ffmpeg* : this does the heavy lifting of capturing, downloading, and encoding files. 

