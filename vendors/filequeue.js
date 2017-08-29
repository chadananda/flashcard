'use strict'

// # Simple LRU cache queue for file assets
// *****************************************
// http://highscalability.com/blog/2016/1/25/design-of-a-modern-cache.html

// ## Queue Eviction Policy:
// With LRU queues, this is very simple. We keep a record of when assets are used
// When we need more space, we sort the queue by that date and delete the Least Recently Used 
// from the queue until we are below our usage limit

// ## Eviction Policy Optimization:
// To make the queue more efficient, improve the Eviction policy using some W-TinyLFU 
// segmentation features. Bascially you segment the queue in half. The most recently used
// half is "protected" while the bottom half of the queue is "probationary". Each item
// gets scored based on usage over 30 days (weighting 10x for recent use). Then the lowest
// scoring items are deleted until we are below our usage limit.
 
// ## File Providers
// Once we have a queue in place, the next step is to set up file providers to look for files
// in various locations (by minimal time and cost)
// so, for instance, one might have several providers organized in priority by speed like:
//  provider[0]: User Browser-Object Cache (0-10ms)
//  provider[1]: Local static cache on SD Card (10-100ms)
//  provider[2]: WebDav P2P local devices (1-2s)
//  provider[3]: Local Network Storage Cache [IP List] (2-5s)
//  proider [4]: CDN Endpoint (3-10s, network cost)
//               CDN Proxy List [IP List] (remembers last successful proxy)
//  provider[5]: Amazon S3 bucket (8-15s, network cost, transfer cost)
 
// ## Predictive Pre-loading
// The real magic happens when we set up rules based on expected user behavior for predictive
// pre-loading of content. Each user action should be paired with a prediction of what content 
// will soon be required and that content queued up with enough time to load before it is needed.

// ## Optimizing Predictive Pre-loading
// For improvement over time, we need to log two events: 1) system loads a file which was previously 
// evicted -- suggesting that our evection policy needs adjustment and 2) user requests a file which 
// was not pre-loaded -- suggesting that our predictive rules need tweaked.

// ## User Override and User Settings
// If the user overrides the smart queueing by specifying that resources should be saved, this overrides
// our eviction policy and decreases the amount of storage space the queue can work with.
// The user needs to be give a way to clear such overrides and adjust overall storage space.
 
// fileid = `${filehash}-${bytesize}.${ext}`
// asset = {fileid, size, storageSize, status: {downloaded, filepath, type}}

// queue = {
//   max_storage: n, // total bytes available for storage
//   current_storage: n,
//   files: {fileid: {asset}} 
//   eviction_log: {fileid: date_evicted}
//   fails: {fileid: [ {date, type:"reload|load"} ] } 
// }
  
class LRUQueue {
  constructor(fileProviders, maxStorage=5) {
    fileProviders.forEach((provider, index) => {
      this.addProvider(provider, index)
    })
    this.maxStorage = maxStorage
    this.storeSize = 0
  }
  addProvider(provider, priority) {
    provider.priority = priority 
    if (this.fileProviders) this.fileProviders = this.fileProviders.push(provider)
      .sort( (a1,a2) => a1.priority>a2.priority )
    else this.fileProviders = [ provider ]
  }
  getFile(URL) {

  }
  needFile(fileUrl, type, priority) {

  }
  cleanQueue() {} // checks if queue files are still available
  deleteFile(fileid) {}
  purgeFiles() {} // deletes files with storageSize at bottom of queue to make room
}

class FileProvider {
  constructor() {}
}