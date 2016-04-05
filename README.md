# flex-combo 介绍

## 介绍

Combo技术最初出现源于[《高性能网站建设指南》](http://book.douban.com/subject/3132277/)的规则一所提到“减少HTTP请求"，是一个在服务端提供，合并多个文件请求在一个响应中的技术。

在生产环境中，Combo功能有很多实现，例如[Tengine](http://tengine.taobao.org/document_cn/http_concat_cn.html)。 

在前端开发环境中，由于最终上线需要将资源引入的代码合并，从而无法在本地轻量开发调试，引起开发调试不便。

`flex-combo`是在开发环境模拟实现了此功能的服务器，目的是方便前端开发调试。约等于一个支持Combo语法，只能访问js、css、iconfont等静态资源的Web服务器。
区别于生产环境的Combo，`flex-combo`专为前端开发环境量身打造，舍弃部分高并发特性，从而提供了丰富的功能和轻量的体积。

## 安装

全局安装

```
npm install -g flex-combo
```

或者安装到某个项目

```
npm install flex-combo
```

##快速上手

首先，修改`hosts文件`，将需要代理的线上地址映射到本地，例如(`g.cdn.cn`)：

```
127.0.0.1   g.cdn.cn
```

然后，在命令行启动`flex-combo`

```
sudo flex-combo
```

之后所有向`g.cdn.cn`发起的资源文件请求都将通过`flex-combo`代理

## 特性

### 轻量易用

轻松支持多种类型URL对应资源文件列表的解析。通过简单的参数配置，支持多种类型的Combo语法，如Yahoo风格和Taobao风格。

![](http://img04.taobaocdn.com/tps/i4/T1d448FndXXXXgVCfH-611-365.png)

`flex-combo`不但是一个组件库，同时也是一个命令行工具。如果不想写脚本做扩展，可以通过一个命令享受到本地开发调试的好处。

### 与线上环境协作

`flex-combo`会解析请求URL，分析出待处理文件列表。若本地存在对应文件，则读取本地最新内容，否则查询并读取本地缓存，当缓存中也不存在所需资源的情况下，则通过构造请求，向服务器获取线上内容。最终将本地和线上的内容做合并操作并返回。

![](http://img04.taobaocdn.com/tps/i4/T1ye85Fg8eXXXhTOTo-570-438.png)

以上机制能够保证调试期和最终上线后的内容顺序完全一致。

* 新版`flex-combo`还进一步支持了HTTPS资源的代理

### 灵活易扩展

`flex-combo`能够以中间件的形式嵌入Connect、Express、Koa等生态系统，与其他中间件一起组合，实现前端开发调试工程化的更多功能。

* 新版`flex-combo`支持利用defineParser方法完全掌握URL解析逻辑的控制权！

* 此外，在新版`flex-combo`中，利用addEngine方法，还可以添加assets动态编译引擎，例如在`flex-combo`默认提供的LESS和SASS两种CSS预处理语法编译器之外，还可轻松添加对Stylus等其它类似语法的支持。

### 完全本地开发

所有请求过的线上内容都会被缓存于本地。下次请求将直接从本地缓存获取内容。这个过程对前端开发者来说是透明的。只是会感觉第一次请求资源时稍慢一些。这样，前端开发项目，只需要在项目建成的第一次，向利用`flex-combo`向线上请求一次资源，后续就再用无需网络，从而实现离线开发。

![](http://img02.taobaocdn.com/tps/i2/T1ohh6FmxcXXX06.PE-714-548.png)

### 扁平化本地目录及多目录挂接

`flex-combo`允许把本地目录挂接到任意url上。这个特性让前端在面临/apps/xxxx/yyy/zzz这样深度目录请求时，无需在本地创建同样深度的目录。

![](http://img01.taobaocdn.com/tps/i1/T11d47FX0cXXabys_j-669-370.png)

多个url挂接点，这个特性使前端工程可以更加灵活。

![](http://img01.taobaocdn.com/tps/i1/T1IFX5FchfXXaQk2Md-598-190.png)

### 编码处理

在经典Combo功能中，如果请求的多个文件以不一致的方式编码，存在GBK和UTF8混杂的情况。Combo功能将不同编码格式的内容合并到一齐返回。目前生产环境中，js代码上线前会经过压缩和转码，此问题不会暴露出来。但是在前端开发环境中，返回的前端代码为了可读性不应被压缩和编码，一旦出现混合编码的情况，这种不便就会暴露出来。

![](http://img01.taobaocdn.com/tps/i1/T1jn86FllbXXbqNQkk-634-351.png)

`flex-combo`对这个技术细节做了周详考虑，内部提供了基于内容的编码探测机制。根据文件内容确定编码格式，一旦发现混合编码的情况，就将不符合要求的编码内容，就将起转换为输出编码格式。输出编码格式是可用户自定义的，目前支持UTF8和GBK两种。


## 命令参数

用法: flex-combo [options]

Options 如下:

```
-d, --dir [string]        本地目录，默认为执行命令的当前目录
-c, --config [string]     配置文件所在目录,在其下的配置文件flex-combo.json中可以设置更多`高阶命令参数`
-p, --http_port [int]     启动HTTP服务的端口，默认为80
-P, --https_port [int]    启动HTTPS服务的端口，默认为443
```

## 高阶命令参数

```
命令行 > Node.js函数调用参数 > 配置文件
```
 
一份完整的配置如下：

```
{
  "rootdir": "src",
  "urls": {
    "/xxx": "/Users/david/xxxproject"
   },
  "charset": "utf-8",
  "urlBasedCharset": {},
  "hosts": {
    "a.cdn.cn":"122.225.67.241",
    "g.cdn.cn":"115.238.23.250"
  },
  "cache": true,
  "headers": {"host":"a.cdn.cn"},
  "servlet": "?",
  "seperator": ",",
  "engine": {
    "^/mock/.+\\.json$":"mock/index.js"
  },
  "filter": {
    "\\?.+": "",
    "-min\\.js$": ".js",
    "-min\\.css$": ".css"
  },
  "dac/babel": {
    "target": [],
    "options": {}
  },
  "dac/xmd": {
    "anonymous": false,
    "filter": {},
    "cmd": [],
    "kmd": []
  },
  "dac/polymer": {
    "filter": {}
  }
}
```
#### rootdir

`flex-combo`所代理资源文件的本地映射根目录

#### urls

urls参数是一个对象，指定需要代理路径。key表示需要被代理的url，value表示这个url将被映射到的本地硬盘路径。如上边配置所示`"/xxx":"/Users/david/xxxproject"`表示，所有以`/xxx`开头的请求都会从本地`/Users/david/xxxproject`目录中寻找文件。即就是请求`127.0.0.1/xxx/a.js`，返回`/Users/david/xxxproject/a.js`。支持子目录。

urls是对象，可以配置多个。如：

```
{
  "/xxx": "/Users/david/xxxproject",
  "/yyy": "/Users/david/yyyproject"
}
```

这样将支持`/xxx`的请求到`/Users/david/xxxproject`获取内容，`/yyy`的请求到`/Users/david/yyyproject`获取内容。

当配置多个url映射时。有可能出现两个url同时符合两个规则。 如：

```
{
  "/xxx": "/Users/david/xxxproject",
  "/xxx/aaa": "/Users/david/yyyproject"
}
```

`flex-combo`将根据**最长匹配**原则，选择最合适规则访问资源文件。上面例子中，如果请求`/xxx/aaa/b.js`,虽然同时符合两项规则，但最终生效规则是字符串最长的那项，也就是`"/xxx/aaa":"/Users/david/yyyproject"`，`/xxx/aaa/b.js`会从`/Users/david/yyyproject"`获取。

urls参数对前端开发灵活的在本地支持多个项目有重要意义。在实际项目中，可以灵活运用配置文件全局参数和命令行参数以获取开发便利性。

#### 编码参数

`charset` 设置flex-combo返回数据的编码集。只能设置为`gbk`或者`utf-8`。该设置与源文件编码集无关。`flex-combo`假设源文件只有`gbk`和`utf-8`两种编码方式。会自动探测源文件是否`utf-8`。因此你可以在一个combo链接中同时引入`utf-8`和`gbk`编码的文件而不会出错。

`urlBasedCharset` 可针对某一个url设置响应字符集。例如：

```
  "charset" : "utf-8",
  "urlBasedCharset" : {"/apps/aaa.js":"gbk"}
```

允许在大多数情况下返回字符集为utf-8字符集的资源。但在访问/apps/aaa.js的情况下，以gbk的方式编码。
这个特性多被用来引入编码几不同的第三方脚本。

#### host相关参数

`flex-combo`支持当资源不在本地时去线上服务器请求所需资源。host相关参数是定位服务器的关键参数，与host有关的参数有3个。`host`、`headers`、`hosts`

```
"headers": {
  "host": "a.cdn.cn"
},
```

* 多资源服务器转发。例如a.cdn.cn的请求需要转发到某个IP。g.cdn.cn的请求需要转发到另外一个IP。`hosts`参数允许配置多组域名、IP组信息。以便选择合适的服务器转发。`hosts`参数是一个对象，其中key表示域名，value表示IP。例如：

```
"hosts":{
    "a.cdn.cn": "122.225.67.241",
    "g.cdn.cn": "115.238.23.250"
}
``` 

将根据发送请求的http头host信息。匹配合适的转发IP。如果请求为`a.cdn.cn/a.js`将转发到`122.225.67.241`。如果请求为`g.cdn.cn/a.js`。将转发到`115.238.23.250`

#### 缓存远程文件

`cache` 为true时，从远程抓取的文件将会被缓存

#### combo规则相关参数

不同的开发环境有不同的combo需求。通过`servlet`和`seperator`两个参数决定。

#### 自定义引擎

`engine` 支持使用者自行插入处理逻辑（处理权交给使用者编写的js），可应用于截获url进行数据mock或对应某些文件后缀匹配处理逻辑。

#### 过滤器

`filter` 配置可以用来过滤传入url。`filter`配置是一个对象，其中key是匹配的正则表达式，value是替换的字符串，支持正则表达式变量。替换的顺序与定义无关。这个设置可被用来在替换访问压缩的js文件为原文件。做到开发者友好。

#### 调试信息输出规则

`traceRule` 为正则表达式字符串，确定终端窗口显示信息的规则

## lib开发模式

通过`require("flex-combo").API`，引入`flex-combo`的API，其暴露出对象Class，`new`操作创建FlexCombo实例。

* 通过`addEngine`方法添加assets动态编译引擎
```
var http = require("http");
var FlexCombo = require("flex-combo").API;

// 添加assets动态编译引擎
// 例如要加入stylus支持，可通过addEngine添加动态编译逻辑
FlexCombo.addEngine("\\.styl\\.css$", function (absPath, reqOpt, param, callback) {
  callback(null, "/* css content */");
});

http
  .createServer(function (req, res) {
    var fcInst = new FlexCombo({});
    fcInst.handle(req, res, function () {
      res.writeHead(404, {"Content-Type": "text/plain"});
      res.end("Your combo file not found.");
    });
  })
  .listen(80, function() {
    console.log("Started!");
  });
```

## FAQ 
1. 为什么会提示`Error: listen EACCES`？

`flex-combo`使用80端口建立前端服务器，在Linux、Mac下使用80端口需要root权限。解决这个问题的方法是使用`sudo flex-combo [options]`的方式运行。

2. 为什么会提示`Error: listen EADDRINUSE`？

`flex-combo`所需要使用的端口正在被使用中，如果这个端口是80端口，你需要检查系统中是否有其他Web容器（如Apache、Nginx等）是否使用了80端口。如果不是，你需要检查是否系统中有其他`flex-combo`进程正在运行。
