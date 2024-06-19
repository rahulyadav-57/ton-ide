import { FileExtensionToFileType, FileType } from '@/enum/file';
import { NetworkEnvironment } from '@/interfaces/workspace.interface';
import { Config } from '@orbs-network/ton-access';
import { Address, Cell, Dictionary, Slice } from '@ton/core';

export function fileTypeFromFileName(name: string): FileType {
  return fileTypeForExtension(name.split('.').pop() || '');
}

export function fileTypeForExtension(extension: string): any {
  return FileExtensionToFileType[extension as any] || FileType.Unknown;
}

export const isWebAssemblySupported = () => {
  return (() => {
    try {
      if (
        typeof WebAssembly === 'object' &&
        typeof WebAssembly.instantiate === 'function'
      ) {
        const assemblyModule = new WebAssembly.Module(
          Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
        );
        if (assemblyModule instanceof WebAssembly.Module)
          return (
            new WebAssembly.Instance(assemblyModule) instanceof
            WebAssembly.Instance
          );
      }
    } catch (e) {}
    return false;
  })();
};

export const encodeBase64 = (data: string) => {
  return Buffer.from(data).toString('base64');
};
export const decodeBase64 = (data: string) => {
  return Buffer.from(data, 'base64').toString('ascii');
};

export const objectToJSON = (obj: Object) => {
  let input: any = {};
  for (const [p, val] of Object.entries(obj)) {
    // convert all values to string. This would need to parse the json to string. Otherwise would fail for big number.
    input[p] = val.toString();
  }
  return input;
};

export const delay = (timeout: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
};

type DebounceFn = (...args: any[]) => void;
export const debounce = <T extends DebounceFn>(callback: T, delay: number) => {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
};

export const getContractLINK = (
  contractAddress: string,
  chainNetwork: NetworkEnvironment
) => {
  // if (chainNetwork === 'SANDBOX') {
  //   return '';
  // }
  // return `
  // <a
  //   href="${getContractURL(contractAddress, chainNetwork)}"
  //   target="_blank"
  // >
  //   View Deployed Contract
  // </a>`
  return '';
};

export const getContractURL = (
  contractAddress: string,
  chainNetwork: NetworkEnvironment
) => {
  if (chainNetwork === 'SANDBOX') {
    return contractAddress;
  }
  return `https://${
    chainNetwork === 'TESTNET' ? 'testnet.' : ''
  }tonscan.org/address/${contractAddress}`;
};

export const htmlToAnsi = (html: string) => {
  // Replace <b> and <i> tags with ANSI escape codes for bold and italic
  html = html.replace(/<b>(.*?)<\/b>/g, '\x1b[1m$1\x1b[22m'); // Bold
  html = html.replace(/<i>(.*?)<\/i>/g, '\x1b[3m$1\x1b[23m'); // Italic

  // Replace <span> elements with ANSI escape codes for color
  html = html.replace(
    /<span style="color:(.*?)">(.*?)<\/span>/g,
    (match, color, content) => {
      const colorMap: any = {
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        reset: '\x1b[0m',
      };
      return `${colorMap[color]}${content}${colorMap.reset}`;
    }
  );

  // Remove other HTML tags
  html = html.replace(/<\/?[^>]+(>|$)/g, '');

  return html;
};

export const isHTML = RegExp.prototype.test.bind(/(<([^>]+)>)/i);

export const getFileNameFromPath = (filePath: string): string => {
  const pathArray = filePath.split('/');

  // Get the last element of the array, which is the file name
  const fileName = pathArray[pathArray.length - 1];

  return fileName;
};

export const getFileExtension = (fileName: string) => {
  if (!fileName) return;
  return fileName.split('.').slice(1).join('.');
};

export const capitalizeFirstLetter = (inputString: string) => {
  if (inputString.length === 0) {
    return inputString; // Return an empty string as-is
  }

  // Capitalize the first letter
  const firstLetter = inputString.charAt(0).toUpperCase();
  const restOfTheString = inputString.slice(1);

  return firstLetter + restOfTheString;
};

export const convertToText = (obj: any): string => {
  //create an array that will later be joined into a string.
  var string = [];

  //is object
  //    Both arrays and objects seem to return "object"
  //    when typeof(obj) is applied to them. So instead
  //    I am checking to see if they have the property
  //    join, which normal objects don't have but
  //    arrays do.
  if (obj == undefined) {
    return String(obj);
  } else if (typeof obj == 'object' && obj.join == undefined) {
    if (obj instanceof Address) return obj.toString();
    if (obj instanceof Slice) return obj.toString();
    if (obj instanceof Cell) return obj.toString();
    if (obj instanceof Dictionary) {
      const items = [];
      for (const key of obj.keys())
        items.push(`${convertToText(key)}: ${convertToText(obj.get(key))}`);
      const itemsStr = items.join(', ');
      return itemsStr ? `{ ${itemsStr} }` : `{}`;
    }

    for (const prop in obj) {
      if (obj.hasOwnProperty(prop))
        string.push(prop + ': ' + convertToText(obj[prop]));
    }
    return '{' + string.join(', ') + '}';

    //is array
  } else if (typeof obj == 'object' && !(obj.join == undefined)) {
    for (const prop in obj) {
      string.push(convertToText(obj[prop]));
    }
    return '[' + string.join(',') + ']';

    //is function
  } else if (typeof obj == 'function') {
    string.push(obj.toString());

    //all other values can be done with JSON.stringify
  } else {
    if (typeof obj == 'string') string.push(JSON.stringify(obj));
    else if (typeof obj == 'bigint') string.push(obj.toString());
    else string.push(obj.toString());
  }

  return string.join(',');
};

export const tonHttpEndpoint = ({ network }: Config) => {
  return `https://${
    network === 'testnet' ? 'testnet.' : ''
  }toncenter.com/api/v2/jsonRPC`;
};
