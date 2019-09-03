
# FAQ

## Fun Deploy

### NoPermissionError: You are not authorized to do this action. Resource: acs:ram:*:xxxxxxxxxx:role/* Action: ram:GetRole

这个问题是由于通过子用户执行 `fun deploy`，但是没有给该子用户配置 AliyunRAMFullAccess 权限导致的。

解决方法：为子用户配置 AliyunRAMFullAccess 的权限或者使用主账户 ak。

### FCAccessDeniedError: GET /services/localdemo failed with 403. requestid: a73f4640-0c8d-958c-c248-db0cc70d834e, message: The service or function doesn't belong to you

这个问题发生在 fun deploy 时配置的 accountId 与 accessKeyId 不匹配：

![](https://tan-blog.oss-cn-hangzhou.aliyuncs.com/img/20181229150556.png)

有可能是写成了其他人的 accountId，也有可能是将登录名误认为是 accountId。

### FCINVALIDArgumentError: PUT /services/xxxxx failed with 400. requestId: xxxxx, message: VSwitch 'xxxxx' does not exist in VPC 'xxxxx'. The VSwith may not exist or the service role does not have 'vpc:DescribeVSwitchAttributes` permission.

这个问题发生在使用 `fun deploy` 部署配置了 vpc 的函数：

![](https://tan-blog.oss-cn-hangzhou.aliyuncs.com/img/20181214113413.png)

如果已经确认错误提示中的 VSwitch 存在于 VPC 中，那么就可能是因为没有为服务角色添加 `AliyunECSNetworkInterfaceManagementAccess` 的权限。文档可以[参考](https://help.aliyun.com/knowledge_detail/72959.html)。

为服务角色添加权限的方法很简单，可以直接在 template.yml 中通过 [Policies](https://github.com/aliyun/fun/blob/master/docs/specs/2018-04-03-zh-cn.md#aliyunserverlessservice) 声明：

```
ROSTemplateFormatVersion: '2015-09-01'
Transform: 'Aliyun::Serverless-2018-04-03'
Resources:
  localdemo:
    Type: 'Aliyun::Serverless::Service'
    Properties:
      Description: 'local invoke demo'
      Policies:
        - AliyunECSNetworkInterfaceManagementAccess
      VpcConfig:
        VpcId: 'vpc-j6cfu2g6tslzekh8grfmk'
        VSwitchIds: [ 'vsw-j6chkgsg9naj6gx49espd' ]
        SecurityGroupId: 'sg-j6ceitqs6ljyssm1apom'
```

指定 `Policies` 时，Fun 会附加该权限到 Fun 创建的默认角色上。

也可以手动添加权限 `AliyunECSNetworkInterfaceManagementAccess` 到指定 role 上，然后将 [Role](https://github.com/aliyun/fun/blob/master/docs/specs/2018-04-03-zh-cn.md#aliyunserverlessservice) 属性配置到 template.yml 中：

```
ROSTemplateFormatVersion: '2015-09-01'
Transform: 'Aliyun::Serverless-2018-04-03'
Resources:
  localdemo:
    Type: 'Aliyun::Serverless::Service'
    Properties:
      Description: 'local invoke demo'
      Role: 'acs:ram::1911504709953557:role/customrole'
      VpcConfig:
        VpcId: 'vpc-j6cfu2g6tslzekh8grfmk'
        VSwitchIds: [ 'vsw-j6chkgsg9naj6gx49espd' ]
        SecurityGroupId: 'sg-j6ceitqs6ljyssm1apom'
```

注意，`Role` 与 `Polices` 不能同时使用，如果配置了 `Role`，则 `Polices` 会被忽略。

## Fun Local

### Error starting userland proxy: mkdir /port/tcp:0.0.0.0:80:tcp:172.17.0.2:5000: input/output error.

这个问题发生在 windows 平台上的 `docker for windows`。错误信息如下：

![](https://tan-blog.oss-cn-hangzhou.aliyuncs.com/img/20181214112210.png)

已被确认为是一个 `docker for windows` 的 [bug](https://github.com/docker/for-win/issues/573)。

一个可行的解法是：

禁用 `Experimental Features`，并重启 `docker`。

![](https://tan-blog.oss-cn-hangzhou.aliyuncs.com/img/20181214112400.png)

### Fun local invoke && Fun local start

本地使用 Fun 时，如果需要在本地运行、调试函数，则需要使用 fun local 子命令。使用 fun local 子命令就需要预先安装 Docker。

#### Windows

如果在您的 Windows 系统上安装的是 Docker Toolbox，在本地使用 `fun local invoke` 或者 `fun local start` 命令时提示信息如下：<br />![image.png](/figures/fun_local_error_on_toolbox.png)

提示默认主机路径为 C:\Users，Docker Toolbox 只能挂载 C 盘当前用户的目录，挂载其它盘都不会生效。错误信息中路径为 `D:\image_crawler`，所以失败。<br />如果想挂载其它盘符的路径，步骤如下：<br />1.打开 `Oracle VM VirtualBox`：

![image.png](/figures/virtual-box.png)

2.选择共享文件夹，选择添加，选择我们需要共享的文件夹。确定并重启 Virtual Box。

![image.png](/figures/steps.png)

**注**： step 5 中的**共享文件夹名称**应按照上述格式手动填写。盘符小写，且以 `/` 为分隔符，同时保证路径完整性。例如：`d/fun/demo`，`e/fun/work` ...

由于 `Docker Toolbox` 官方也已经不在维护，为了更好的体验，我们希望您使用 [Docker For Windows](http://mirrors.aliyun.com/docker-toolbox/windows/docker-for-windows/beta/)。(建议使用我们提供的安装链接，某些版本的 Docker for Windows 可能存在不稳定的问题。)

#### MacOS
如果在您的 MacOS 系统上安装了 Docker，在本地使用在本地使用 `fun local invoke` 或者 `fun local start` 命令时提示信息如下：<br />![image.png](/figures/fun_local_error_on_docker_share_file.png)

提示添加相应路径至 Docker File sharing list ， 这是因为您的 CodeUri 对应的目录不在 Docker 的 File Sharing 中，需要手动添加，步骤如下：<br />1.打开 `Docker Preferences`：

![image.png](/figures/docker-preferences.png)

2.选择共享文件夹，选择`File Sharing`，点击`+`，选择 CodeUri 对应的目录，添加后点击`Apply & Restart`。

![image.png](/figures/add_docker_file_sharing.png)

**注**：更多信息请参考 [Docker For Mac](https://docs.docker.com/docker-for-mac/osxfs/)