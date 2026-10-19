import java.nio.channels.Selector;
public class SelectorProbe {
 public static void main(String[] args) throws Exception {
  System.out.println("TEMP="+System.getenv("TEMP"));
  System.out.println("java.io.tmpdir="+System.getProperty("java.io.tmpdir"));
  try(Selector selector=Selector.open()){System.out.println("NIO_OK "+selector.getClass().getName());}
 }
}
